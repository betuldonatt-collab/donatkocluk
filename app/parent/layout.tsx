import { headers } from "next/headers";

import { AdminViewSwitcher } from "@/components/admin-view-switcher";

export default async function ParentLayout({ children }: LayoutProps<"/parent">) {
  const role = (await headers()).get("x-user-role");

  return (
    <div className="flex flex-1 flex-col">
      {role === "admin" && <AdminViewSwitcher />}
      <div className="flex flex-1">{children}</div>
    </div>
  );
}
