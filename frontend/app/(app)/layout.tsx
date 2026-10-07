import { CaptureMenu } from "@/components/CaptureMenu";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import styles from "./shell.module.css";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar>
          <NotificationsMenu />
          <CaptureMenu />
        </Topbar>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
