"use client";
import { useParams } from "next/navigation";
import { AiSection } from "@/components/settings/AiSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { ComingSoon } from "@/components/ComingSoon";
import { sectionById } from "@/lib/settingsSections";
import styles from "../settings.module.css";

export default function SettingsSectionPage() {
  const { section } = useParams<{ section: string }>();
  const info = sectionById(section);

  return (
    <div className={styles.content}>
      {!info ? (
        <div className="empty"><strong>That settings page does not exist</strong></div>
      ) : info.id === "appearance" ? (
        <AppearanceSection />
      ) : info.id === "ai" ? (
        <AiSection />
      ) : (
        <>
          <h1>{info.label}</h1>
          <ComingSoon title={info.label}>{info.blurb}</ComingSoon>
        </>
      )}
    </div>
  );
}
