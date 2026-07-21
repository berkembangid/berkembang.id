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

export default function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial value
  const initialDateParts = value.split(" ");
  const datePart = initialDateParts[0] || new Date().toISOString().split("T")[0];
  const timePart = initialDateParts[1] || "";

  const [dateStr, setDateStr] = useState(datePart);
  const [hasTime, setHasTime] = useState(!!timePart);
  const [timeStr, setTimeStr] = useState(timePart || "12:00");

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

  // Update parent when dateStr, hasTime, or timeStr changes
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

  const handleTimeChange = (newTimeStr: string) => {
    setTimeStr(newTimeStr);
    if (hasTime) {
      onChange(`${dateStr} ${newTimeStr}`);
    }
  };

  // Calendar calculations
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

  const daysArray: { day: number; isCurrentMonth: boolean; dateString: string }[] = [];

  // Previous month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = currentMonth === 0 ? 11 : currentMonth - 1;
    const y = currentMonth === 0 ? currentYear - 1 : currentYear;
    const dateString = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    daysArray.push({ day: d, isCurrentMonth: false, dateString });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    daysArray.push({ day: d, isCurrentMonth: true, dateString });
  }

  // Next month padding days to complete grid (multiples of 7)
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

  // Format display date: "21 Juli 2026"
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
            className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-5 w-80 animate-fade-in-up"
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
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={navigateNextMonth}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
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
                    className={`w-full aspect-square max-h-8 rounded-lg flex items-center justify-center transition-all ${
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

            {/* Time Picker Divider */}
            <div className="border-t border-slate-100 my-3.5 pt-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasTime}
                    onChange={(e) => handleToggleTime(e.target.checked)}
                    className="rounded border-[#c5c5d7] text-[#001b85] focus:ring-[#001b85] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tambah Jam</span>
                </label>
              </div>

              {hasTime && (
                <div className="flex items-center gap-2 bg-[#f3f2ff]/60 border border-[#e5e7ff] rounded-xl p-2 animate-fade-in">
                  <Clock size={14} className="text-slate-400 flex-shrink-0" />
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-[#001b85] focus:outline-none w-full cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Confirm Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full bg-[#001b85] text-white font-bold py-2.5 rounded-xl text-[10px] uppercase tracking-wider hover:bg-[#0e32c2] transition-colors mt-1"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
