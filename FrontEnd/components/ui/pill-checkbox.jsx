"use client";

import { useState } from "react";
import { cn } from "./utils";

export function PillCheckbox({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-full border transition-all",
        "hover:bg-[#EEEDF7]",
        checked
          ? "bg-[#27235C] text-white border-[#27235C]"
          : "bg-white text-[#27235C] border-[#27235C]"
      )}
    >
      {label}
    </button>
  );
}

export function PillCheckboxRow({ options, selectedValues, onChange, maxVisible = 5 }) {
  const [showAll, setShowAll] = useState(false);

  const visibleOptions = showAll ? options : options.slice(0, maxVisible);
  const hasMore = options.length > maxVisible;

  const toggleValue = (value) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleOptions.map((option) => (
        <PillCheckbox
          key={option.value}
          label={option.label}
          checked={selectedValues.includes(option.value)}
          onChange={() => toggleValue(option.value)}
        />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="px-3 py-1.5 text-sm font-medium rounded-full border border-[#27235C] text-[#27235C] bg-white hover:bg-[#EEEDF7] transition-all"
        >
          {showAll ? "Show Less" : `Show More ▼`}
        </button>
      )}
    </div>
  );
}
