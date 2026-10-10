import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | ApplyFlow",
  description: "Terms for using ApplyFlow to organize internship and job applications.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="Guidelines and limitations for using ApplyFlow to organize your job search."
    >
      <LegalSection title="Purpose of ApplyFlow">
        <p>
          ApplyFlow is an organizational tool for tracking internship, work-integrated
          learning (WIL), graduate, and other job applications. You can record application
          details, review status updates, manage interview information, and, if available,
          connect Gmail to help identify relevant messages.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibilities">
        <p>
          Provide information that is accurate to the best of your knowledge and keep your
          application records up to date. You are responsible for reviewing your records,
          deadlines, interview details, and any automatically detected updates before
          relying on them.
        </p>
        <p>
          Use ApplyFlow only in compliance with applicable law and with accounts and
          information you are authorized to use. If you connect Gmail, you must be authorized
          to access that mailbox and permit its messages to be processed for application
          updates.
        </p>
      </LegalSection>

      <LegalSection title="Account security">
        <p>
          Keep your password private, use a secure device, and do not share your account or
          login credentials with others. You are responsible for activity performed through
          your account and for protecting devices where you remain signed in. Tell the
          operator of your ApplyFlow deployment if you suspect unauthorized access.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>
          Do not attempt to access accounts, data, or systems without authorization; misuse
          another person&apos;s information; interfere with or disrupt the website, API, or
          connected services; or use ApplyFlow for unlawful, abusive, or fraudulent
          activity. Do not circumvent access controls or impair the service for other users.
        </p>
      </LegalSection>

      <LegalSection title="Service limitations">
        <p>
          Application tracking and Gmail-detected updates are organizational aids, not
          guarantees. An update may be missed, incomplete, delayed, or incorrectly matched.
          Check important information with the employer and the original message. ApplyFlow
          does not guarantee an interview, job offer, notification delivery, or employment
          outcome.
        </p>
        <p>
          The service depends on the availability and configuration of the website, API,
          database, Google services (if Gmail is connected), and optional email-reminder
          provider. Any of these services may be unavailable or change, and ApplyFlow does
          not promise uninterrupted operation.
        </p>
      </LegalSection>

      <LegalSection title="Stopping use and termination">
        <p>
          You can stop using ApplyFlow at any time, delete individual application records
          through the available application features, or disconnect Gmail from the Gmail
          page. Application deletion and Gmail disconnection do not delete your account or
          all previously retained Gmail processing records.
        </p>
        <p>
          The current service does not provide self-service account termination or account
          deletion. Contact the operator of the ApplyFlow deployment you use for account
          termination or deletion requests. The operator may restrict or end access when
          needed to address misuse, security concerns, or service changes.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          These terms may be updated as ApplyFlow changes. The terms published on this page
          are the current version presented by the website; review this page periodically
          for updates.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
