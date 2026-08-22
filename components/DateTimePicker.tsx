"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Check } from "lucide-react";

interface DateTimePickerProps {
  value: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm
  onChange: (val: string) => void;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const DAYS_OF_WEEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const TIME_PRESETS = [
  { label: "Pagi 08:00", time: "08:00" },
  { label: "Siang 12:00", time: "12:00" },
  { label: "Sore 16:00", time: "16:00" },
  { label: "Malam 19:00", time: "19:00" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const YEARS = Array.from({ length: 31 }, (_, i) => 2015 + i);

export default function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial value
  const initialDateParts = value.split(" ");
  const datePart = initialDateParts[0] || new Date().toISOString().split("T")[0];
  const timePart = initialDateParts[1] || "";

  const [dateStr, setDateStr] = useState(datePart);
  const [hasTime, setHasTime] = useState(!!timePart);
  
  const initialHour = timePart ? timePart.split(":")[0] : "12";
  const initialMinute = timePart ? timePart.split(":")[1] : "00";
  const [selectedHour, setSelectedHour] = useState(initialHour);
  const [selectedMinute, setSelectedMinute] = useState(initialMinute);

  const timeStr = `${selectedHour}:${selectedMinute}`;

  const [currentYear, setCurrentYear] = useState(() => {
    const d = new Date(datePart);
    return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  });
  
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(datePart);
    return isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth();
  });

  // Handle click outside to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync state when value prop changes from parent
  useEffect(() => {
    if (value) {
      const parts = value.split(" ");
      if (parts[0]) {
        setDateStr(parts[0]);
        const d = new Date(parts[0]);
        if (!isNaN(d.getTime())) {
          setCurrentYear(d.getFullYear());
          setCurrentMonth(d.getMonth());
        }
      }
    }
  }, [value]);

  const handleSelectDate = (newDateStr: string) => {
    setDateStr(newDateStr);
    if (hasTime) {
      onChange(`${newDateStr} ${timeStr}`);
    } else {
      onChange(newDateStr);
    }
  };

  const handleToggleTime = (enabled: boolean) => {
    setHasTime(enabled);
    if (enabled) {
      onChange(`${dateStr} ${timeStr}`);
    } else {
      onChange(dateStr);
    }
  };

  const updateTime = (h: string, m: string) => {
    setSelectedHour(h);
    setSelectedMinute(m);
    if (hasTime) {
      onChange(`${dateStr} ${h}:${m}`);
    }
  };

  // Calendar calculations
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
  const daysArray: { day: number; isCurrentMonth: boolean; dateString: string }[] = [];

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = currentMonth === 0 ? 11 : currentMonth - 1;
    const y = currentMonth === 0 ? currentYear - 1 : currentYear;
    const dateString = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    daysArray.push({ day: d, isCurrentMonth: false, dateString });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    daysArray.push({ day: d, isCurrentMonth: true, dateString });
  }

  const remainingCells = 42 - daysArray.length;
  for (let d = 1; d <= remainingCells; d++) {
    const m = currentMonth === 11 ? 0 : currentMonth + 1;
    const y = currentMonth === 11 ? currentYear + 1 : currentYear;
    const dateString = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    daysArray.push({ day: d, isCurrentMonth: false, dateString });
  }

  const navigatePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const navigateNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const getFormattedDisplay = () => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Pilih Tanggal";
    const day = d.getDate();
    const month = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    const dateDisplay = `${day} ${month} ${year}`;
    return hasTime ? `${dateDisplay}, ${timeStr}` : dateDisplay;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-xs font-semibold px-4 py-3 rounded-xl border border-[#c5c5d7] hover:border-[#001b85] transition-colors bg-white text-left focus:outline-none"
      >
        <span className="text-slate-700 truncate">{getFormattedDisplay()}</span>
        <div className="flex items-center gap-1.5 text-slate-400">
          {hasTime ? <Clock size={14} /> : <CalendarIcon size={14} />}
        </div>
      </button>

      {/* Lightweight Dropdown Popover */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-slate-200 shadow-xl rounded-2xl p-4 w-76 sm:w-80"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Calendar Month & Year Header Dropdowns */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              {/* Month Dropdown */}
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(Number(e.target.value))}
                className="text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border-0 rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
              >
                {MONTHS.map((m, idx) => (
                  <option key={idx} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              {/* Year Dropdown */}
              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(Number(e.target.value))}
                className="text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border-0 rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={navigatePrevMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={navigateNextMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                title="Bulan Berikutnya"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1.5 font-mono">
            {DAYS_OF_WEEK.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium">
            {daysArray.map((cell, idx) => {
              const isSelected = cell.dateString === dateStr;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDate(cell.dateString)}
                  className={`w-full aspect-square max-h-7.5 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[#0f2d6b] text-white font-bold"
                      : cell.isCurrentMonth
                      ? "text-slate-800 hover:bg-blue-50 hover:text-[#0f2d6b]"
                      : "text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Time Picker Toggle & Options */}
          <div className="border-t border-slate-100 my-2.5 pt-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasTime}
                  onChange={(e) => handleToggleTime(e.target.checked)}
                  className="rounded border-[#c5c5d7] text-[#0f2d6b] focus:ring-[#0f2d6b] w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tambah Waktu</span>
              </label>
              {hasTime && (
                <span className="text-[11px] font-bold text-[#0f2d6b] bg-blue-50 px-2 py-0.5 rounded-md font-mono">
                  {timeStr}
                </span>
              )}
            </div>

            {hasTime && (
              <div className="space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1">
                  {TIME_PRESETS.map((p) => (
                    <button
                      key={p.time}
                      type="button"
                      onClick={() => {
                        const [h, m] = p.time.split(":");
                        updateTime(h, m);
                      }}
                      className={`text-[9.5px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                        timeStr === p.time
                          ? "bg-[#0f2d6b] text-white border-[#0f2d6b]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-[#0f2d6b]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom Hour & Minute Selectors */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <span className="block text-[8.5px] font-bold text-slate-400 uppercase mb-0.5">Jam</span>
                    <select
                      value={selectedHour}
                      onChange={(e) => updateTime(e.target.value, selectedMinute)}
                      className="w-full bg-white text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg px-2 py-1 focus:border-[#0f2d6b] outline-none cursor-pointer"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>{h}:00</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-[8.5px] font-bold text-slate-400 uppercase mb-0.5">Menit</span>
                    <select
                      value={selectedMinute}
                      onChange={(e) => updateTime(selectedHour, e.target.value)}
                      className="w-full bg-white text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg px-2 py-1 focus:border-[#0f2d6b] outline-none cursor-pointer"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>:{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Close / Apply button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full bg-[#0f2d6b] text-white font-bold py-2 rounded-xl text-[10px] uppercase tracking-wider hover:bg-blue-900 transition-colors mt-1 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}
    </div>
  );
}
