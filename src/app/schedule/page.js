import ScheduleClient from "@/components/ScheduleClient";

export const viewport = { themeColor: "#07060b" };

export const metadata = {
  title: "Schedule — AnimeDex",
  description: "Weekly anime airing schedule and upcoming releases",
};

export default function SchedulePage() {
  return <ScheduleClient />;
}
