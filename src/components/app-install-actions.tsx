"use client";

import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type AppInstallActionsProps = {
  variant?: "compact" | "full";
};

const androidApkUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL;
const windowsInstallerUrl = process.env.NEXT_PUBLIC_WINDOWS_INSTALLER_URL;

export function AppInstallActions({ variant = "full" }: AppInstallActionsProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isIOS = useRef(false);
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    isIOS.current = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallMessage("Home Made Food is installed on this device.");
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setInstallMessage(
        isIOS.current
          ? "In Safari, tap Share, then choose Add to Home Screen."
          : "Use your browser’s Install app or Add to Home Screen option to install the web app.",
      );
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallMessage(choice.outcome === "accepted" ? "Home Made Food is being installed." : "Installation was cancelled.");
      setInstallPrompt(null);
    } catch (error) {
      console.error("The browser failed to start the Home Made Food installation prompt.", error);
      setInstallMessage("The browser could not start installation. Use its menu to install this app.");
    }
  };

  return (
    <details className={`app-install app-install-${variant}`}>
      <summary>{variant === "compact" ? "Install App" : "Download App"}</summary>
      <div className="app-install-panel">
        <p>Install the Home Made Food web app on your device.</p>
        <button className="app-install-button" type="button" onClick={install}>Install on this device</button>
        {variant === "full" && (
          <div className="app-download-options">
            {androidApkUrl
              ? <a href={androidApkUrl} download>Download Android App (APK)</a>
              : <button type="button" disabled title="An Android installer has not been published">Android APK — not published</button>}
            {windowsInstallerUrl
              ? <a href={windowsInstallerUrl} download>Download Windows Desktop App</a>
              : <button type="button" disabled title="A Windows installer has not been published">Windows app — not published</button>}
            <span className="ios-install-note">iPhone/iPad: open this site in Safari, tap Share, then “Add to Home Screen”.</span>
          </div>
        )}
        {installMessage && <p className="app-install-message" role="status">{installMessage}</p>}
      </div>
    </details>
  );
}
