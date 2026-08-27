import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_TEST_URL;
const outputPath = path.resolve("types/database.generated.ts");
const checkOnly = process.argv.includes("--check");

if (!databaseUrl) {
  throw new Error("DATABASE_TEST_URL is required (use a disposable local *_test database).");
}

const parsedUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname) ||
  !parsedUrl.pathname.toLowerCase().endsWith("_test")
) {
  throw new Error("Refusing type generation outside a localhost database ending in _test.");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const { rows: columns } = await client.query(`
    select
      table_info.table_name,
      table_info.table_type,
      column_info.column_name,
      column_info.data_type,
      column_info.udt_name,
      column_info.is_nullable,
      column_info.column_default,
      column_info.is_generated,
      column_info.ordinal_position
    from information_schema.tables as table_info
    join information_schema.columns as column_info
      on column_info.table_schema = table_info.table_schema
      and column_info.table_name = table_info.table_name
    where table_info.table_schema = 'public'
      and table_info.table_type in ('BASE TABLE', 'VIEW')
    order by table_info.table_type, table_info.table_name, column_info.ordinal_position
  `);

  const { rows: foreignKeys } = await client.query(`
    select
      constraint_record.conname as constraint_name,
      source_table.relname as table_name,
      source_attribute.attname as column_name,
      target_table.relname as referenced_table,
      target_attribute.attname as referenced_column,
      key_position.ordinality as position
    from pg_constraint as constraint_record
    join pg_class as source_table on source_table.oid = constraint_record.conrelid
    join pg_namespace as source_namespace on source_namespace.oid = source_table.relnamespace
    join pg_class as target_table on target_table.oid = constraint_record.confrelid
    join lateral unnest(constraint_record.conkey) with ordinality as key_position(attribute_number, ordinality) on true
    join lateral unnest(constraint_record.confkey) with ordinality as target_position(attribute_number, ordinality)
      on target_position.ordinality = key_position.ordinality
    join pg_attribute as source_attribute
      on source_attribute.attrelid = source_table.oid
      and source_attribute.attnum = key_position.attribute_number
    join pg_attribute as target_attribute
      on target_attribute.attrelid = target_table.oid
      and target_attribute.attnum = target_position.attribute_number
    where constraint_record.contype = 'f'
      and source_namespace.nspname = 'public'
    order by source_table.relname, constraint_record.conname, key_position.ordinality
  `);

  const { rows: routines } = await client.query(`
    select
      procedure_record.proname as function_name,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', coalesce(
              procedure_record.proargnames[argument_record.position],
              'arg_' || argument_record.position::text
            ),
            'type', format_type(argument_record.type_oid, null),
            'optional', argument_record.position > procedure_record.pronargs - procedure_record.pronargdefaults
          )
          order by argument_record.position
        )
        from unnest(procedure_record.proargtypes::oid[]) with ordinality
          as argument_record(type_oid, position)
      ), '[]'::jsonb) as arguments,
      format_type(procedure_record.prorettype, null) as return_type,
      procedure_record.proretset as returns_set
    from pg_proc as procedure_record
    join pg_namespace as namespace_record on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.prokind = 'f'
      and procedure_record.prorettype <> 'trigger'::regtype
      and not exists (
        select 1
        from pg_depend as dependency_record
        where dependency_record.classid = 'pg_proc'::regclass
          and dependency_record.objid = procedure_record.oid
          and dependency_record.deptype = 'e'
      )
    order by procedure_record.proname
  `);

  const definitions = new Map();
  for (const column of columns) {
    const current = definitions.get(column.table_name) ?? {
      tableType: column.table_type,
      columns: [],
      relationships: new Map(),
    };
    current.columns.push(column);
    definitions.set(column.table_name, current);
  }

  for (const key of foreignKeys) {
    const definition = definitions.get(key.table_name);
    if (!definition) continue;
    const relationship = definition.relationships.get(key.constraint_name) ?? {
      constraintName: key.constraint_name,
      columns: [],
      referencedTable: key.referenced_table,
      referencedColumns: [],
    };
    relationship.columns.push(key.column_name);
    relationship.referencedColumns.push(key.referenced_column);
    definition.relationships.set(key.constraint_name, relationship);
  }

  const renderType = (column) => {
    let type;
    if (column.data_type === "ARRAY") {
      type = column.udt_name === "_text" ? "string[]" : "Json[]";
    } else if (["json", "jsonb"].includes(column.data_type)) {
      type = "Json";
    } else if (["boolean"].includes(column.data_type)) {
      type = "boolean";
    } else if (
      ["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision"].includes(
        column.data_type,
      )
    ) {
      type = "number";
    } else {
      type = "string";
    }
    return column.is_nullable === "YES" ? `${type} | null` : type;
  };

  const renderPostgresType = (typeName) => {
    const isArray = typeName.endsWith("[]");
    const scalarType = isArray ? typeName.slice(0, -2) : typeName;
    let type;
    if (["json", "jsonb"].includes(scalarType)) {
      type = "Json";
    } else if (scalarType === "boolean") {
      type = "boolean";
    } else if (
      ["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision"].includes(
        scalarType,
      )
    ) {
      type = "number";
    } else if (scalarType === "void") {
      type = "never";
    } else {
      type = "string";
    }
    return isArray ? `${type}[]` : type;
  };

  const renderFields = (table, mode) =>
    table.columns
      .map((column) => {
        const optional =
          mode !== "Row" &&
          (mode === "Update" ||
            column.is_nullable === "YES" ||
            column.column_default !== null ||
            column.is_generated !== "NEVER");
        return `          ${column.column_name}${optional ? "?" : ""}: ${renderType(column)}`;
      })
      .join("\n");

  const renderRelationships = (table) => {
    const relationships = [...table.relationships.values()];
    if (relationships.length === 0) return "[]";
    return `[\n${relationships
      .map(
        (relationship) => `          {
            foreignKeyName: ${JSON.stringify(relationship.constraintName)}
            columns: ${JSON.stringify(relationship.columns)}
            isOneToOne: false
            referencedRelation: ${JSON.stringify(relationship.referencedTable)}
            referencedColumns: ${JSON.stringify(relationship.referencedColumns)}
          }`,
      )
      .join(",\n")}\n        ]`;
  };

  const tables = [...definitions.entries()].filter(([, value]) => value.tableType === "BASE TABLE");
  const views = [...definitions.entries()].filter(([, value]) => value.tableType === "VIEW");
  const renderTable = ([name, table]) => `      ${name}: {
        Row: {
${renderFields(table, "Row")}
        }
        Insert: {
${renderFields(table, "Insert")}
        }
        Update: {
${renderFields(table, "Update")}
        }
        Relationships: ${renderRelationships(table)}
      }`;
  const renderView = ([name, view]) => `      ${name}: {
        Row: {
${renderFields(view, "Row")}
        }
        Relationships: ${renderRelationships(view)}
      }`;
  const renderRoutine = (routine) => `      ${routine.function_name}: {
        Args: ${routine.arguments.length === 0 ? "Record<string, never>" : `{\n${routine.arguments
          .map(
            (argument) =>
              `          ${argument.name}${argument.optional ? "?" : ""}: ${renderPostgresType(argument.type)}`,
          )
          .join("\n")}\n        }`}
        Returns: ${renderPostgresType(routine.return_type)}${routine.returns_set ? "[]" : ""}
      }`;

  const output = `// Generated from the repository migrations. Do not edit by hand.
// Regenerate with: DATABASE_TEST_URL=<localhost-db-ending-_test> npm run db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
${tables.map(renderTable).join("\n")}
    }
    Views: {
${views.map(renderView).join("\n")}
    }
    Functions: {
${routines.map(renderRoutine).join("\n")}
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database["public"]

export type Tables<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName]["Row"]

export type TablesInsert<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName]["Insert"]

export type TablesUpdate<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName]["Update"]
`;

  if (checkOnly) {
    const current = await readFile(outputPath, "utf8");
    if (current !== output) {
      throw new Error("types/database.generated.ts is stale; run npm run db:types.");
    }
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    console.log(`Generated ${path.relative(process.cwd(), outputPath)} from ${tables.length} tables, ${views.length} views, and ${routines.length} functions.`);
  }
} finally {
  await client.end();
}
