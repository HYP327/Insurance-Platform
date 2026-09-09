import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const fieldClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
}

function FieldWrapper({ label, htmlFor, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldWrapper label={label} htmlFor={props.id ?? props.name ?? label}>
      <input {...props} id={props.id ?? props.name ?? label} className={fieldClassName} />
    </FieldWrapper>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldWrapper label={label} htmlFor={props.id ?? props.name ?? label}>
      <select {...props} id={props.id ?? props.name ?? label} className={fieldClassName}>
        {children}
      </select>
    </FieldWrapper>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}
