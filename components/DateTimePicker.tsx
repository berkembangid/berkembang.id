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

      {/* Modal Dialog Calendar */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-5 w-84 animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Calendar Month Header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 font-headline">
                {MONTHS[currentMonth]} {currentYear}
              </h4>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={navigatePrevMonth}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={navigateNextMonth}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-2 font-mono-label">
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
                    className={`w-full aspect-square max-h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#001b85] text-white font-bold shadow-sm shadow-[#001b85]/20"
                        : cell.isCurrentMonth
                        ? "text-slate-800 hover:bg-[#ececff]/50 hover:text-[#001b85]"
                        : "text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            {/* Custom Interactive Time Picker (No Browser Native Control) */}
            <div className="border-t border-slate-100 my-3.5 pt-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasTime}
                    onChange={(e) => handleToggleTime(e.target.checked)}
                    className="rounded border-[#c5c5d7] text-[#001b85] focus:ring-[#001b85] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tambah Jam & Waktu</span>
                </label>
                {hasTime && (
                  <span className="text-xs font-bold text-[#001b85] bg-[#ececff] px-2.5 py-0.5 rounded-full font-mono">
                    {timeStr}
                  </span>
                )}
              </div>

              {hasTime && (
                <div className="space-y-2.5 bg-[#f8f8ff] p-3 rounded-xl border border-[#e5e7ff] animate-fade-in">
                  {/* Preset Quick Time Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_PRESETS.map((p) => (
                      <button
                        key={p.time}
                        type="button"
                        onClick={() => {
                          const [h, m] = p.time.split(":");
                          updateTime(h, m);
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                          timeStr === p.time
                            ? "bg-[#001b85] text-white border-[#001b85]"
                            : "bg-white text-slate-600 border-slate-200 hover:border-[#001b85]"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Hour & Minute Selectors */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Jam</span>
                      <select
                        value={selectedHour}
                        onChange={(e) => updateTime(e.target.value, selectedMinute)}
                        className="w-full bg-white text-xs font-bold text-[#001b85] border border-[#c5c5d7] rounded-lg px-2 py-1.5 focus:border-[#001b85] outline-none cursor-pointer"
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>{h}:00 ({Number(h) < 12 ? "Pagi" : Number(h) < 15 ? "Siang" : Number(h) < 18 ? "Sore" : "Malam"})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Menit</span>
                      <select
                        value={selectedMinute}
                        onChange={(e) => updateTime(selectedHour, e.target.value)}
                        className="w-full bg-white text-xs font-bold text-[#001b85] border border-[#c5c5d7] rounded-lg px-2 py-1.5 focus:border-[#001b85] outline-none cursor-pointer"
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

            {/* Confirm Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full bg-[#001b85] text-white font-bold py-2.5 rounded-xl text-[10px] uppercase tracking-wider hover:bg-[#0e32c2] transition-colors mt-1 cursor-pointer shadow-sm"
            >
              Selesai & Terapkan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
