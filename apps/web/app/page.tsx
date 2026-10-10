import Image from "next/image";
import Link from "next/link";

const waysToContribute = [
  {
    number: "01",
    title: "Ask in the open",
    description: "Keep questions, decisions, and project updates where the whole community can find them.",
    color: "text-[#16765b]",
  },
  {
    number: "02",
    title: "Build on each other’s work",
    description: "Follow a conversation from the first question through thoughtful replies and useful context.",
    color: "text-[#b2603e]",
  },
  {
    number: "03",
    title: "Make room for more people",
    description: "Give contributors a shared place to meet, exchange ideas, and move projects forward.",
    color: "text-[#96711f]",
  },
];

export default function Home() {
  return (
    <main className="bg-[#f5f8f6]">
      <header className="absolute inset-x-0 top-0 z-20 border-b border-white/20 text-white">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Commons home">
            <span className="grid size-9 place-items-center rounded-md border border-white/50 bg-white/10 text-sm font-bold">C</span>
            <span className="text-sm font-semibold">Commons</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-white/10">Sign in</Link>
            <Link href="/register" className="rounded-md bg-[#f1c66d] px-3 py-2 text-sm font-semibold text-[#263b31] transition-colors hover:bg-[#ffda8a] sm:px-4">Create account</Link>
          </nav>
        </div>
      </header>

      <section className="relative flex min-h-[620px] items-end overflow-hidden bg-[#123d30] pb-14 pt-28 text-white sm:min-h-[660px] sm:pb-20">
        <Image
          src="/community-onboarding.png"
          alt="Contributors working together on an open-source project"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[#102d24]/60" />
        <div className="relative z-10 mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase text-[#f1c66d]">A home for open-source communities</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight">Commons</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-white/90">Good projects are built in the open, together. Give every question, idea, and contributor a place to belong.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/register" className="rounded-md bg-[#f1c66d] px-5 py-3 text-sm font-bold text-[#263b31] transition-colors hover:bg-[#ffda8a]">Create your community</Link>
            <Link href="/login" className="rounded-md border border-white/60 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">I already have an account</Link>
          </div>
          <p className="mt-6 text-xs font-medium text-white/75">Workspaces · Discussions · Threaded conversations</p>
        </div>
      </section>

      <section className="border-b border-[#dce6e0] bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-7 px-4 py-10 sm:grid-cols-3 sm:px-6 sm:py-12 lg:px-8">
          {waysToContribute.map((item) => (
            <article key={item.number} className="border-t border-[#dce6e0] pt-4">
              <p className={`text-sm font-bold ${item.color}`}>{item.number}</p>
              <h2 className="mt-2 text-lg font-semibold text-[#17231f]">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#63716a]">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-6 text-sm text-[#63716a] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>Commons <span aria-hidden="true">·</span> Built for people who build in the open.</span>
        <Link href="/register" className="font-semibold text-[#16765b] hover:text-[#105d47]">Start a community <span aria-hidden="true">-&gt;</span></Link>
      </footer>
    </main>
  );
}
