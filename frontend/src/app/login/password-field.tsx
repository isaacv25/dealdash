"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({
  label,
  name,
  placeholder,
}: Readonly<{
  label: string;
  name: string;
  placeholder: string;
}>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-[var(--muted)]" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input
          className="field pr-12"
          id={name}
          name={name}
          placeholder={placeholder}
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-3 flex items-center text-[var(--muted)] transition hover:text-[var(--foreground)]"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
