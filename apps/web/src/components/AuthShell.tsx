import Image from "next/image";
import Link from "next/link";

export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#0f1013] text-[#dfe1e5] flex items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.16]"
        style={{
          background:
            "radial-gradient(60rem 40rem at 15% -10%, #00E5FF 0%, transparent 55%), radial-gradient(50rem 40rem at 90% 110%, #7C4DFF 0%, transparent 55%)",
        }}
      />
      <div className="relative w-full max-w-[400px]">
        <Link href="/" className="mb-8 flex items-center gap-2.5 justify-center">
          <Image src="/logo.svg" alt="" width={30} height={30} priority />
          <span className="text-[17px] font-semibold tracking-tight">Aptivus</span>
        </Link>
        <div className="rounded-xl border border-[#2b2d33] bg-[#17181c] p-7 shadow-2xl">
          <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] text-[#8b8f96]">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-[13px] text-[#8b8f96]">{footer}</div>}
      </div>
    </main>
  );
}

export const inputClass =
  "w-full rounded-lg border border-[#33363d] bg-[#101115] px-3 py-2.5 text-[14px] text-[#dfe1e5] " +
  "placeholder:text-[#5f646d] outline-none transition focus:border-[#4aa3ff] " +
  "focus:ring-2 focus:ring-[#4aa3ff]/20";

export const buttonClass =
  "w-full rounded-lg bg-[#39c06c] px-4 py-2.5 text-[14px] font-semibold text-[#07230f] transition " +
  "hover:bg-[#43d179] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[#4aa3ff] disabled:cursor-not-allowed disabled:opacity-50";

export const ghostButtonClass =
  "w-full rounded-lg border border-[#33363d] bg-transparent px-4 py-2.5 text-[14px] font-medium " +
  "text-[#dfe1e5] transition hover:border-[#4a4f57] hover:bg-[#1d1f24] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4aa3ff] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const labelClass = "mb-1.5 block text-[12.5px] font-medium text-[#a9adb5]";
