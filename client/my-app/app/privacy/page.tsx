import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | ApplyFlow",
  description: "Learn what ApplyFlow collects, how information is used and stored, and how to manage a Gmail connection.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How ApplyFlow handles account, application, notification, and Gmail information."
    >
      <p className="text-sm leading-7 text-slate-600 sm:text-base">
        This policy describes information handled by the current ApplyFlow website and
        server implementation. ApplyFlow helps people organize internship and job
        applications. The service stores some information to provide that functionality.
      </p>

      <LegalSection title="Information we collect">
        <p>
          When you register, ApplyFlow receives your name and email address, your password
          (stored as a bcrypt hash rather than as plain text), and an optional phone number.
          The account record also has a creation date.
        </p>
        <p>
          Application information you enter can include company, position, application date,
          type, status, work arrangement, notes, application link, and interview details.
          Notification preferences and reminder details may also be stored.
        </p>
        <p>
          If you connect Gmail, ApplyFlow stores the connected Gmail address, connection and
          sync status, and Gmail authorization tokens. The server encrypts access and refresh
          tokens using AES-256-GCM before storing them in the configured database.
        </p>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>
          Account and application details are used to provide your tracker, display
          application and interview information, and manage notifications. Gmail information
          is used to identify possible updates to the applications you track.
        </p>
        <p>
          The current server requests Gmail messages and parses their sender, subject, and
          message text in memory to look for application-status changes and interview
          details. It compares those details with your saved applications. A sufficiently
          matched update may change an application; an uncertain match can be placed in your
          review queue. The initial sync normally checks messages from the previous 30 days;
          later syncs check for new changes. The initial period can be configured by the
          service operator.
        </p>
        <p>
          ApplyFlow does not save the Gmail message body in its database. It does save
          processing records, including Gmail message and thread identifiers, sender,
          subject, received and processed times, detected status or interview details,
          confidence, review outcome and reason, and related application identifiers. These
          records can appear in Gmail processing history or the review queue.
        </p>
      </LegalSection>

      <LegalSection title="Gmail permissions and disconnecting">
        <p>
          Connecting Gmail asks Google for the{" "}
          <code className="break-all rounded bg-[#fff4f7] px-1.5 py-0.5 text-sm text-[#7b4a63]">
            https://www.googleapis.com/auth/gmail.readonly
          </code>{" "}
          permission. This is read-only access for finding relevant messages. ApplyFlow does
          not request permission to send, change, or delete Gmail messages.
        </p>
        <p>
          To disconnect, sign in and use the Gmail page at{" "}
          <Link href="/gmail" className="font-medium text-[#0f766e] underline underline-offset-4">
            /gmail
          </Link>
          . ApplyFlow attempts to revoke the stored refresh token with Google, removes its
          saved Gmail address and tokens, and stops future syncing. Previously saved Gmail
          processing records are not removed when you disconnect.
        </p>
      </LegalSection>

      <LegalSection title="Storage, sharing, and service providers">
        <p>
          Account, application, notification, Gmail connection, and Gmail processing records
          are stored in the PostgreSQL database configured for the ApplyFlow deployment.
          Gmail message content is requested from Google for processing; Google handles its
          own account and API services under its policies.
        </p>
        <p>
          Where email reminders are configured, ApplyFlow sends them through Resend to the
          address selected for a reminder. The reminder includes the company, position, and
          interview date and time. Resend therefore receives the information needed to
          deliver that email. ApplyFlow does not send Gmail messages through your connected
          mailbox.
        </p>
        <p>
          These are the third-party services directly reflected in the current
          implementation. The deployment operator controls the hosting, database, and
          provider configuration; their location and additional operational practices are
          not specified here.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          The implementation does not define an automatic retention period for account,
          application, notification, or Gmail processing records. They may remain in the
          configured database until changed or removed through application behavior or by
          the operator.
        </p>
        <p>
          Deleting an individual application removes that application and its notification
          jobs. Related Gmail processing history remains, with its link to the deleted
          application cleared. Disconnecting Gmail removes the stored connection tokens and
          address but not its processing history.
        </p>
        <p>
          There is no self-service account deletion feature in the current implementation.
          For account or broader data deletion requests, contact the operator of the
          ApplyFlow deployment you use. No particular response period or deletion schedule
          is configured by the application.
        </p>
      </LegalSection>

      <LegalSection title="Keeping information secure">
        <p>
          The implementation hashes account passwords with bcrypt and encrypts Gmail OAuth
          tokens before database storage. These measures do not mean that any online service
          or transmission is risk-free. Protect your password and devices, and contact the
          deployment operator if you believe your account has been accessed without
          permission.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
