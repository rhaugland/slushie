import { clsx } from "clsx";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-gray-200 bg-white p-4",
        className
      )}
    >
      {children}
    </div>
  );
}
