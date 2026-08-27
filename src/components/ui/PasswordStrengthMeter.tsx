import { getPasswordStrength, type PasswordStrength } from "@/lib/passwordStrength";

const barConfig: Record<PasswordStrength, { width: string; bar: string; label: string }> = {
  Weak: { width: "w-1/3", bar: "bg-rose-500", label: "text-rose-400" },
  Fair: { width: "w-2/3", bar: "bg-amber-500", label: "text-amber-400" },
  Strong: { width: "w-full", bar: "bg-emerald-500", label: "text-emerald-400" },
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const strength = getPasswordStrength(password);
  const { width, bar, label } = barConfig[strength];

  return (
    <div className="mt-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-all ${width} ${bar}`} />
      </div>
      <p className={`mt-1 text-xs font-medium ${label}`}>{strength}</p>
    </div>
  );
}
