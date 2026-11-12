export default function PageHeader({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink sm:text-[21px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
