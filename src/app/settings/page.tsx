import { AllowedSendersSection } from "@/components/settings/allowed-senders-section";
import { ClientPreferencesSection } from "@/components/settings/client-preferences-section";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Settings</h1>
        <p className="text-muted-foreground">
          Manage who can be selected as the sender on a delivery.
        </p>
      </div>
      <AllowedSendersSection />
      <ClientPreferencesSection />
    </div>
  );
}
