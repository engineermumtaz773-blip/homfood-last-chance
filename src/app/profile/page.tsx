import { ProfilePortal } from "@/components/profile-portal";

export default function ProfilePage() {
  return (
    <>
      <section className="page-hero profile-page-hero"><span className="section-kicker">Your Home Made Food account</span><h1>Your profile</h1><p>Manage your delivery details and see recent order requests from this device.</p></section>
      <section className="profile-page-section"><ProfilePortal /></section>
    </>
  );
}
