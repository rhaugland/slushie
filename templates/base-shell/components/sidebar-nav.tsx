"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavFeature = {
  id: string;
  title: string;
  route: string;
  enabled: boolean;
  children: NavFeature[];
};

export function SidebarNav() {
  const [features, setFeatures] = useState<NavFeature[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => r.json())
      .then((data) => setFeatures(data.features || []));
  }, []);

  const enabledFeatures = features.filter((f) => f.enabled);

  return (
    <nav className="w-56 border-r border-gray-200 bg-gray-50 p-4 min-h-screen">
      <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Features
      </div>
      <ul className="space-y-1">
        {enabledFeatures.map((f) => (
          <li key={f.id}>
            <Link
              href={f.route}
              className={`block px-3 py-2 rounded-md text-sm ${
                pathname === f.route
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {f.title}
            </Link>
            {f.children.filter((c) => c.enabled).length > 0 && (
              <ul className="ml-4 mt-1 space-y-1">
                {f.children
                  .filter((c) => c.enabled)
                  .map((c) => (
                    <li key={c.id}>
                      <Link
                        href={c.route}
                        className={`block px-3 py-1.5 rounded-md text-xs ${
                          pathname === c.route
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        {c.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
