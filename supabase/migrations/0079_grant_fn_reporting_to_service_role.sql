-- Migration 0079: Grant fn_* reporting functions ke service_role
--
-- Fungsi-fungsi pelaporan (fn_income_statement, fn_balance_sheet, dst.)
-- sebelumnya hanya di-grant ke uthenticated. Dossier PDF generator
-- menggunakan service role client (karena membaca data milik UMKM lain),
-- sehingga perlu grant eksplisit ke service_role.

grant execute on function public.fn_income_statement(uuid, date, date) to service_role;
grant execute on function public.fn_balance_sheet(uuid, date) to service_role;
grant execute on function public.fn_cash_flow(uuid, date, date) to service_role;
grant execute on function public.fn_notes_data(uuid, date, date) to service_role;
grant execute on function public.fn_indicator_monthly(uuid, date, date) to service_role;
