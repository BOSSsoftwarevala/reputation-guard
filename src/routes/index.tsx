import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/icon-3d";
import { ThemeToggle } from "@/components/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OrbitRep — Google Review Removal & Reputation Intelligence" },
      {
        name: "description",
        content:
          "Scan thousands of Google reviews for policy violations with AI, build evidence-backed removal cases and track appeals across every location.",
      },
      { property: "og:title", content: "OrbitRep — Google Review Removal & Reputation Intelligence" },
      {
        property: "og:description",
        content:
          "AI policy-violation scanning, removal case management and client reporting for multi-location brands.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES: { icon: Icon3DName; title: string; body: string }[] = [
  {
    icon: "scanner",
    title: "AI policy violation scanner",
    body: "Every review is analysed against Google's published review policies — spam, fake content, off-topic, conflict of interest, harassment and more — with a confidence score and written rationale.",
  },
  {
    icon: "reviews",
    title: "Review operations at scale",
    body: "Import or sync thousands of reviews, filter by rating, category, priority and status, and batch-triage the queue without losing a single record.",
  },
  {
    icon: "cases",
    title: "Removal case management",
    body: "Move cases from New through Reviewing, Evidence ready, Reported, Appeal and Resolved, with a full audit trail on every action.",
  },
  {
    icon: "reports",
    title: "Evidence packages",
    body: "Export a professional, submission-ready summary containing the review, business context, policy category and AI analysis.",
  },
  {
    icon: "analytics",
    title: "Reputation analytics",
    body: "Rating trend, violation mix, negative-volume tracking and per-location benchmarking computed from live data.",
  },
  {
    icon: "locations",
    title: "Multi-location workspaces",
    body: "One workspace per brand, unlimited locations, role-based access and per-location attribution for every review and case.",
  },
];

const STEPS = [
  { title: "Import", body: "Bring in your Google review export or sync a location feed." },
  { title: "Scan", body: "The AI scanner classifies each review and assigns a removal priority." },
  { title: "Build", body: "Open a case, collect evidence and generate the submission package." },
  { title: "Report", body: "Submit to Google, log the appeal and report outcomes to the client." },
];

function Landing() {
  return (
    <div className="grid-bg min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <span className="flex items-center gap-2.5 font-display text-lg font-bold">
            <ShieldCheck className="h-6 w-6 text-neon" />
            OrbitRep
          </span>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth" className="glass rounded-xl px-4 py-2 text-sm font-medium">
              Sign in
            </Link>
            <Link
              to="/auth"
              className="rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <section className="grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-neon" />
              AI policy analysis for Google reviews
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Remove policy-violating reviews.{" "}
              <span className="bg-gradient-to-r from-violet via-neon to-magenta bg-clip-text text-transparent">
                Protect the rating you earned.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground">
              OrbitRep scans thousands of Google reviews for violations of Google's own review policies,
              builds evidence-backed removal cases and tracks every report and appeal to resolution —
              across every location you manage.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-5 py-3 text-sm font-semibold text-primary-foreground hover:neon-outline"
              >
                Open the command center <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="glass inline-flex items-center rounded-xl px-5 py-3 text-sm font-medium">
                See how it works
              </a>
            </div>
            <ul className="mt-7 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Policy-aligned AI classification",
                "Submission-ready evidence packages",
                "Multi-location workspaces",
                "Client-ready reporting",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-neon" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card-3d relative p-6">
            <div className="grid grid-cols-2 gap-4">
              {(["dashboard", "scanner", "cases", "analytics"] as Icon3DName[]).map((name) => (
                <div key={name} className="rounded-2xl border border-border/60 bg-surface-2 p-5 text-center">
                  <Icon3D name={name} size={56} className="float-slow mx-auto" />
                  <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {name}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Every number in OrbitRep comes from your live review and case data — no sample content.
            </p>
          </div>
        </section>

        <section id="how" className="py-12">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">How removal actually works</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Google decides every removal. OrbitRep makes your case as strong, consistent and well-evidenced
            as it can possibly be — and keeps the whole pipeline auditable.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="card-3d p-5">
                <span className="font-display text-3xl font-bold text-neon">{index + 1}</span>
                <h3 className="mt-2 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="py-12">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Built for reputation teams</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="card-3d card-3d-hover p-5">
                <Icon3D name={feature.icon} size={44} />
                <h3 className="mt-3 font-display text-lg font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card-3d my-12 p-8 text-center">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">
            Start protecting your rating today
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Create a workspace, import your reviews and run the first AI scan in minutes.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-6 py-3 text-sm font-semibold text-primary-foreground"
          >
            Create your workspace <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} OrbitRep. Reputation intelligence for multi-location brands.</p>
          <p>
            OrbitRep is not affiliated with Google. Removal outcomes are determined solely by Google after
            reviewing each report.
          </p>
        </div>
      </footer>
    </div>
  );
}
