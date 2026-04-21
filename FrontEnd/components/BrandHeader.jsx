"use client";

import Image from "next/image";

import sutherlandLogo from "../Sutherland_logo.png";

export default function BrandHeader({ onHomeClick }) {
  return (
    <button className="flex items-center gap-3" onClick={onHomeClick} type="button">
      <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
        <Image alt="Sutherland logo" className="object-contain" fill sizes="44px" src={sutherlandLogo} />
      </div>
      <div className="text-left">
        <div className="text-xl font-bold tracking-[0.25em] text-brandBlue">
          SUTHERLAND
        </div>
        <div className="mt-1 text-xs tracking-[0.2em] text-slate-500">
          VISION HUB
        </div>
      </div>
    </button>
  );
}
