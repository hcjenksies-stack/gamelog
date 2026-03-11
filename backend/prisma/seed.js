require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding...");

  // ── Badges ────────────────────────────────────────────────────────────────
  await prisma.badge.createMany({
    data: [
      { key: "platinum_hunter",  icon: "🏆", label: "Platinum Hunter",  color: "#c8a43a", desc: "Earned 2+ platinum trophies" },
      { key: "early_adopter",    icon: "⚡", label: "Early Adopter",    color: "#5865f2", desc: "Joined in the first month"   },
      { key: "soulsborne_vet",   icon: "⚔️", label: "Soulsborne Vet",   color: "#9b3030", desc: "100+ hrs across Soulsborne"  },
      { key: "completionist",    icon: "✅", label: "Completionist",    color: "#3ba55d", desc: "Completed 5+ games at 100%"  },
      { key: "indie_lover",      icon: "💜", label: "Indie Lover",      color: "#a855f7", desc: "Logged 10+ indie titles"     },
      { key: "coop_king",        icon: "🤝", label: "Co-op King",       color: "#0ea5e9", desc: "Played 20+ co-op sessions"   },
      { key: "speedrunner",      icon: "⚡", label: "Speedrunner",      color: "#f59e0b", desc: "Sub-1-hour any% clear"       },
      { key: "verified_creator", icon: "✦", label: "Verified Creator", color: "#f0b429", desc: "Verified gaming influencer"  },
    ],
    skipDuplicates: true,
  });

  // ── Studios ───────────────────────────────────────────────────────────────
  const studios = [
    { id: "fs", name: "FromSoftware",    handle: "@fromsoft",   avatar: "⚔️", verified: true, founded: 1986, location: "Tokyo, Japan",        bio: "Creators of Demon's Souls, Dark Souls, Bloodborne, Sekiro, and Elden Ring." },
    { id: "sg", name: "Supergiant Games",handle: "@supergiant", avatar: "🔱", verified: true, founded: 2009, location: "San Jose, CA",         bio: "Independent studio behind Bastion, Transistor, Pyre, Hades, and Hades II. No DLC, ever." },
    { id: "tc", name: "Team Cherry",     handle: "@teamcherry", avatar: "🦋", verified: true, founded: 2014, location: "Adelaide, Australia",  bio: "A tiny studio of three. Made Hollow Knight. Currently finishing Silksong." },
    { id: "nd", name: "Naughty Dog",     handle: "@naughtydog", avatar: "🐾", verified: true, founded: 1984, location: "Santa Monica, CA",     bio: "Creators of Uncharted, The Last of Us, and Crash Bandicoot. PlayStation first-party." },
  ];

  for (const s of studios) {
    await prisma.studio.upsert({ where: { id: s.id }, update: s, create: s });
  }

  // ── Games ─────────────────────────────────────────────────────────────────
  const games = [
    { id: 1, title: "Elden Ring",    genre: "RPG",          cover: "🌑", year: 2022, coop: true,  studioId: "fs" },
    { id: 2, title: "Hades II",      genre: "Roguelike",    cover: "🔱", year: 2024, coop: false, studioId: "sg" },
    { id: 3, title: "Hollow Knight", genre: "Metroidvania", cover: "🦋", year: 2017, coop: false, studioId: "tc" },
    { id: 4, title: "Sekiro",        genre: "Action RPG",   cover: "🎋", year: 2019, coop: false, studioId: "fs" },
    { id: 5, title: "Disco Elysium", genre: "RPG",          cover: "🕵️", year: 2019, coop: false, studioId: null },
  ];

  for (const g of games) {
    const { studioId, ...data } = g;
    await prisma.game.upsert({
      where: { id: g.id },
      update: data,
      create: {
        ...data,
        studios: studioId ? { create: { studioId } } : undefined,
      },
    });
  }

  // ── Studio news ───────────────────────────────────────────────────────────
  await prisma.studioNews.createMany({
    data: [
      { studioId: "fs", type: "announcement", title: "Elden Ring: Nightreign — DLC Announced",  desc: "A massive co-op expansion set in a new region of the Lands Between." },
      { studioId: "fs", type: "update",       title: "Elden Ring Patch 1.14 Live",              desc: "Balance updates across all weapon classes." },
      { studioId: "sg", type: "livestream",   title: "Dev Stream — Hades II Act 3 Deep Dive",   desc: "Join the team Friday for a look at the final act and release window." },
      { studioId: "tc", type: "announcement", title: "Silksong — Out April 18, 2026",           desc: "The long-awaited sequel arrives this spring." },
      { studioId: "nd", type: "announcement", title: "The Last of Us Multiplayer — Still in Development", desc: "Standalone multiplayer with no confirmed date." },
    ],
    skipDuplicates: true,
  });

  // ── Upcoming games ────────────────────────────────────────────────────────
  await prisma.upcomingGame.createMany({
    data: [
      { studioId: "fs", title: "Elden Ring: Nightreign", cover: "🌑", releaseDate: new Date("2026-08-15"), announced: true },
      { studioId: "fs", title: "Untitled New IP",         cover: "❓", releaseDate: null,                   announced: true },
      { studioId: "sg", title: "Hades II — Full Release", cover: "🔱", releaseDate: new Date("2026-06-04"), announced: true },
      { studioId: "tc", title: "Silksong",                cover: "🕷️", releaseDate: new Date("2026-04-18"), announced: true },
      { studioId: "nd", title: "The Last of Us Online",   cover: "🍄", releaseDate: null,                   announced: true },
    ],
    skipDuplicates: true,
  });

  // ── Demo user ─────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("password123", 12);
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@gamelog.app" },
    update: {},
    create: {
      username: "demo_user", handle: "@demo_user",
      email: "demo@gamelog.app", passwordHash,
      avatar: "D", avatarColor: "#5865f2",
      bio: "Just a demo account.", isPublic: true, status: "online",
    },
  });

  // Log a couple of games for the demo user
  await prisma.gameLog.upsert({
    where: { userId_gameId: { userId: demoUser.id, gameId: 1 } },
    update: {},
    create: { userId: demoUser.id, gameId: 1, platform: "ps5", progress: 78, hours: 94, trophiesEarned: 32, trophiesTotal: 54 },
  });
  await prisma.gameLog.upsert({
    where: { userId_gameId: { userId: demoUser.id, gameId: 3 } },
    update: {},
    create: { userId: demoUser.id, gameId: 3, platform: "ps5", progress: 100, hours: 52, trophiesEarned: 40, trophiesTotal: 40, platinum: true },
  });

  console.log("Seed complete.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
