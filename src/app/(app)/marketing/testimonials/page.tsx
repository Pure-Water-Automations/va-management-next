import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadTestimonialRows } from "@/lib/reads/marketing";
import { TestimonialsBoard } from "@/components/marketing/TestimonialsBoard";

export const dynamic = "force-dynamic";

// Testimonials and case studies — button-driven 4-column board.
export default async function TestimonialsPage() {
  await requireSalesUser();
  const testimonials = await loadTestimonialRows();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Marketing</div>
          <h1>Testimonials and case studies</h1>
          <p className="small">
            When sales wins a deal, the client lands in &lsquo;To request&rsquo; automatically. Published quotes appear on
            the sales Testimonials tab for use on calls.
          </p>
        </div>
      </div>
      <TestimonialsBoard testimonials={testimonials} />
    </>
  );
}
