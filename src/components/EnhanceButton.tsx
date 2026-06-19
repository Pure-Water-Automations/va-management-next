"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EnhanceModal } from "@/components/EnhanceModal";

type Assignee = { id: string; name: string | null; email: string };

export function EnhanceButton({
  projectId,
  projectName,
  assignees,
}: {
  projectId: string;
  projectName: string;
  assignees: Assignee[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        ✨ Enhance with Second Brain
      </Button>
      {open && (
        <EnhanceModal
          projectId={projectId}
          projectName={projectName}
          assignees={assignees}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
