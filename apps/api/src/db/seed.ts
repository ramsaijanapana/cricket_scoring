import 'dotenv/config';
import { db } from './index';
import { matchFormatConfig, team, match, matchTeam, appUser } from './schema/index';
import { player } from './schema/player';
import * as argon2 from 'argon2';

async function seed() {
  console.log('Seeding match format configs...');

  await db.insert(matchFormatConfig).values([
    {
      name: 'T20',
      oversPerInnings: 20,
      inningsPerSide: 1,
      maxBowlerOvers: 4,
      powerplayConfig: [
        { name: 'Powerplay', startOver: 1, endOver: 6, fieldingRestriction: 2 },
      ],
      hasSuperOver: true,
      hasDls: true,
      hasFollowOn: false,
      ballsPerOver: 6,
    },
    {
      name: 'ODI',
      oversPerInnings: 50,
      inningsPerSide: 1,
      maxBowlerOvers: 10,
      powerplayConfig: [
        { name: 'Powerplay 1', startOver: 1, endOver: 10, fieldingRestriction: 2 },
        { name: 'Powerplay 2', startOver: 11, endOver: 40, fieldingRestriction: 4 },
        { name: 'Powerplay 3', startOver: 41, endOver: 50, fieldingRestriction: 4 },
      ],
      hasSuperOver: true,
      hasDls: true,
      hasFollowOn: false,
      ballsPerOver: 6,
    },
    {
      name: 'Test',
      oversPerInnings: null,
      inningsPerSide: 2,
      maxBowlerOvers: null,
      powerplayConfig: null,
      hasSuperOver: false,
      hasDls: false,
      hasFollowOn: true,
      followOnThreshold: 200,
      ballsPerOver: 6,
    },
  ]).onConflictDoNothing();

  // ─── Teams ───────────────────────────────────────────────────────────────────
  console.log('Seeding teams...');

  const teamData = [
    { name: 'Mumbai Indians', shortName: 'MI', country: 'India', teamType: 'franchise' },
    { name: 'Chennai Super Kings', shortName: 'CSK', country: 'India', teamType: 'franchise' },
    { name: 'Royal Challengers Bengaluru', shortName: 'RCB', country: 'India', teamType: 'franchise' },
    { name: 'Kolkata Knight Riders', shortName: 'KKR', country: 'India', teamType: 'franchise' },
  ];

  const teams = [];
  for (const t of teamData) {
    const [inserted] = await db.insert(team).values(t).onConflictDoNothing().returning();
    if (inserted) {
      teams.push(inserted);
    } else {
      // Already exists — fetch it
      const existing = await db.query.team.findFirst({
        where: (tbl, { eq }) => eq(tbl.name, t.name),
      });
      if (existing) teams.push(existing);
    }
  }

  // ─── Players (11 per team) ───────────────────────────────────────────────────
  console.log('Seeding players...');

  const playerNames: string[][] = [
    // MI
    ['Rohit Sharma', 'Ishan Kishan', 'Suryakumar Yadav', 'Tilak Varma', 'Hardik Pandya',
     'Tim David', 'Nehal Wadhera', 'Jasprit Bumrah', 'Piyush Chawla', 'Akash Madhwal', 'Arjun Tendulkar'],
    // CSK
    ['Ruturaj Gaikwad', 'Devon Conway', 'Ajinkya Rahane', 'Shivam Dube', 'Ravindra Jadeja',
     'MS Dhoni', 'Moeen Ali', 'Deepak Chahar', 'Tushar Deshpande', 'Matheesha Pathirana', 'Maheesh Theekshana'],
    // RCB
    ['Virat Kohli', 'Faf du Plessis', 'Rajat Patidar', 'Glenn Maxwell', 'Dinesh Karthik',
     'Shahbaz Ahmed', 'Wanindu Hasaranga', 'Harshal Patel', 'Mohammed Siraj', 'Josh Hazlewood', 'Karn Sharma'],
    // KKR
    ['Phil Salt', 'Sunil Narine', 'Venkatesh Iyer', 'Shreyas Iyer', 'Andre Russell',
     'Rinku Singh', 'Ramandeep Singh', 'Mitchell Starc', 'Varun Chakravarthy', 'Harshit Rana', 'Nitish Rana'],
  ];

  const allPlayers: Record<string, any[]> = {};
  for (let i = 0; i < teams.length; i++) {
    const teamPlayers: any[] = [];
    for (const fullName of playerNames[i]) {
      const [firstName, ...rest] = fullName.split(' ');
      const lastName = rest.join(' ');
      const [inserted] = await db.insert(player).values({
        firstName,
        lastName,
      }).onConflictDoNothing().returning();
      if (inserted) {
        teamPlayers.push(inserted);
      }
    }
    allPlayers[teams[i].id] = teamPlayers;
  }

  // ─── Users ───────────────────────────────────────────────────────────────────
  console.log('Seeding users...');

  const defaultPasswordHash = await argon2.hash('password123', {
    type: argon2.argon2id,
    timeCost: 3,
    memoryCost: 65536,
    parallelism: 1,
  });

  await db.insert(appUser).values([
    {
      email: 'admin@cricscore.dev',
      displayName: 'Admin User',
      passwordHash: defaultPasswordHash,
      role: 'admin',
      emailVerified: true,
    },
    {
      email: 'scorer@cricscore.dev',
      displayName: 'Match Scorer',
      passwordHash: defaultPasswordHash,
      role: 'scorer',
      emailVerified: true,
    },
  ]).onConflictDoNothing();

  // ─── Sample Matches ──────────────────────────────────────────────────────────
  console.log('Seeding sample matches...');

  // Look up T20 format
  const t20Format = await db.query.matchFormatConfig.findFirst({
    where: (f, { eq }) => eq(f.name, 'T20'),
  });

  if (t20Format && teams.length >= 4) {
    // Match 1: MI vs CSK
    const [match1] = await db.insert(match).values({
      formatConfigId: t20Format.id,
      venue: 'Wankhede Stadium',
      city: 'Mumbai',
      country: 'India',
      status: 'scheduled',
    }).onConflictDoNothing().returning();

    if (match1) {
      const miPlayers = allPlayers[teams[0].id] || [];
      const cskPlayers = allPlayers[teams[1].id] || [];
      await db.insert(matchTeam).values([
        {
          matchId: match1.id,
          teamId: teams[0].id,
          designation: 'home',
          playingXi: miPlayers.slice(0, 11).map((p: any) => p.id),
        },
        {
          matchId: match1.id,
          teamId: teams[1].id,
          designation: 'away',
          playingXi: cskPlayers.slice(0, 11).map((p: any) => p.id),
        },
      ]).onConflictDoNothing();
    }

    // Match 2: RCB vs KKR
    const [match2] = await db.insert(match).values({
      formatConfigId: t20Format.id,
      venue: 'M. Chinnaswamy Stadium',
      city: 'Bengaluru',
      country: 'India',
      status: 'scheduled',
    }).onConflictDoNothing().returning();

    if (match2) {
      const rcbPlayers = allPlayers[teams[2].id] || [];
      const kkrPlayers = allPlayers[teams[3].id] || [];
      await db.insert(matchTeam).values([
        {
          matchId: match2.id,
          teamId: teams[2].id,
          designation: 'home',
          playingXi: rcbPlayers.slice(0, 11).map((p: any) => p.id),
        },
        {
          matchId: match2.id,
          teamId: teams[3].id,
          designation: 'away',
          playingXi: kkrPlayers.slice(0, 11).map((p: any) => p.id),
        },
      ]).onConflictDoNothing();
    }
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
