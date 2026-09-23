export type ApplicationType = "Internship" | "WIL" | "Graduate Job" | "Full-Time Job";
export type ApplicationStatus =
  | "Saved"
  | "Applied"
  | "Assessment"
  | "Shortlisted"
  | "Interview"
  | "Offer"
  | "Rejected"
  | "Withdrawn";
export type WorkArrangement = "Remote" | "Hybrid" | "Onsite";

export type InterviewType = "Phone" | "Video" | "In-person" | "Technical" | "Panel" | "Other";
export type InterviewStatus = "Upcoming" | "Completed" | "Cancelled";
export type NotificationType = "Interview Reminder" | "Follow-up Reminder" | "Status Update" | "General";
export type NotificationChannel = "In-app" | "Email" | "Phone";

export interface Application {
  id: string;
  company: string;
  position: string;
  date: string;
  type: ApplicationType;
  status: ApplicationStatus;
  arrangement: WorkArrangement;
  notes: string;
  interviewDate?: string;
  interviewTime?: string;
  notificationChannels?: NotificationChannel[];
  interviewEmail?: string;
  interviewPhone?: string;
}

export interface Interview {
  id: string;
  company: string;
  position: string;
  date: string;
  time: string;
  type: InterviewType;
  status: InterviewStatus;
  details: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  type: NotificationType;
  message: string;
  date: string;
  read: boolean;
}
