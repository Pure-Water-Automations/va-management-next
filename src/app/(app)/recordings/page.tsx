import { redirect } from "next/navigation";

// Library now lives nested on /record (see docs/recordings-feature.md).
// Redirect keeps old links/bookmarks working.
export default function RecordingsIndexRedirect() {
  redirect("/record");
}
