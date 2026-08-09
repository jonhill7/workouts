// Guided courses: preloaded multi-week programs where every workout day is a
// ready-made checklist — exercises, sets and reps decided in advance, so
// there is nothing to plan and nothing to type. Pure data + helpers (no DOM,
// no IndexedDB) so the course definitions are unit-testable under Node.
//
// A block prescribes either `reps` (logged as a weight_reps set at
// bodyweight) or `seconds` (a timed hold, logged as a level_time set whose
// level is the set number). Exercises are matched to the store by name and
// created on demand from COURSE_EXERCISES.

export const COURSE_EXERCISES = {
  'Chair Squat': { category: 'Legs' },
  'Bodyweight Squat': { category: 'Legs' },
  'Reverse Lunge': { category: 'Legs' },
  'Step-Ups': { category: 'Legs' },
  'Glute Bridge': { category: 'Legs' },
  'Standing Calf Raise': { category: 'Legs' },
  'Wall Sit': { category: 'Legs', timed: true },
  'Wall Push-Up': { category: 'Chest' },
  'Incline Push-Up': { category: 'Chest' },
  'Knee Push-Up': { category: 'Chest' },
  'Push Up': { category: 'Chest' },
  'Superman': { category: 'Back' },
  'Bird Dog': { category: 'Abs' },
  'Dead Bug': { category: 'Abs' },
  'Crunch': { category: 'Abs' },
  'Plank Hold': { category: 'Abs', timed: true },
  'Side Plank Hold': { category: 'Abs', timed: true },
  'Jumping Jacks': { category: 'Cardio' },
  'Mountain Climbers': { category: 'Cardio' },
  'March in Place': { category: 'Cardio', timed: true },
};

// Per-week prescriptions: `sets`/`reps`/`seconds` are either a constant or an
// array indexed by week (week 1 = index 0).
const wk = (v, w) => (Array.isArray(v) ? v[w - 1] : v);

function rep(name, sets, reps, tip) {
  return w => ({ name, sets: wk(sets, w), reps: wk(reps, w), ...(tip ? { tip } : {}) });
}

function hold(name, sets, seconds, tip) {
  return w => ({ name, sets: wk(sets, w), seconds: wk(seconds, w), ...(tip ? { tip } : {}) });
}

// Expand {title, blocks:[fn(week)]} templates into one flat days array:
// week 1 day A, week 1 day B, … so days[i] is workout i of the course.
function expandDays(weeks, templates) {
  const days = [];
  for (let w = 1; w <= weeks; w++) {
    for (const t of templates) days.push({ title: t.title, blocks: t.blocks.map(b => b(w)) });
  }
  return days;
}

const WARMUP = 'Warm up first (2 min): march in place, roll your shoulders, a few big arm circles.';
const COOLDOWN = 'Cool down: shake it out and stretch anything that feels tight — 20–30 seconds each, slow breaths.';

export const COURSES = [
  {
    id: 'fresh-start',
    name: 'Fresh Start',
    emoji: '🌱',
    tagline: 'Four gentle weeks to wake your body back up.',
    description: 'Been a while? Perfect — this starts exactly where you are. '
      + 'Three short home workouts a week, no equipment beyond a chair and a wall, '
      + 'and no decisions to make: every session lays out what to do and you check it off. '
      + 'By week four you’ll be moving more, sleeping better and feeling brighter.',
    weeks: 4,
    daysPerWeek: 3,
    minutes: '15–20',
    rest: 45,
    warmup: WARMUP,
    cooldown: COOLDOWN,
    days: expandDays(4, [
      {
        title: 'Foundations',
        blocks: [
          rep('Chair Squat', [2, 2, 3, 3], [8, 10, 10, 12], 'Sit back until you tap the chair, then stand tall.'),
          rep('Wall Push-Up', [2, 2, 3, 3], [8, 10, 10, 12], 'Hands on the wall, body in one straight line.'),
          rep('Glute Bridge', [2, 2, 3, 3], [10, 12, 12, 15], 'Squeeze at the top for a second.'),
          rep('Bird Dog', 2, [6, 8, 8, 10], 'Opposite arm and leg — slow and steady, alternating sides.'),
          hold('March in Place', 1, [60, 75, 90, 120], 'Finish strong — lift those knees.'),
        ],
      },
      {
        title: 'Energize',
        blocks: [
          rep('Step-Ups', [2, 2, 3, 3], [10, 10, 12, 12], 'The bottom stair works great. Alternate legs.'),
          rep('Jumping Jacks', 2, [15, 20, 20, 25], 'Step out instead of jumping if you prefer.'),
          rep('Standing Calf Raise', 2, [12, 12, 15, 15], 'Hold the wall for balance.'),
          rep('Dead Bug', 2, [8, 10, 10, 12], 'Keep your lower back glued to the floor.'),
          hold('Plank Hold', 2, [15, 20, 25, 30], 'Knees down is a real plank too.'),
        ],
      },
      {
        title: 'Strong & Steady',
        blocks: [
          rep('Bodyweight Squat', [2, 2, 3, 3], [8, 10, 10, 12], 'Feet shoulder-width, chest up, sit back.'),
          rep('Incline Push-Up', [2, 2, 2, 3], [6, 8, 8, 10], 'Hands on the kitchen counter or couch arm.'),
          rep('Superman', 2, [8, 10, 10, 12], 'Lift arms and legs, pause, lower gently.'),
          rep('Crunch', 2, [10, 12, 12, 15], 'Small and controlled — chin off your chest.'),
          hold('Wall Sit', [1, 1, 2, 2], [20, 25, 30, 30], 'Back flat on the wall. Breathe.'),
        ],
      },
    ]),
  },
  {
    id: 'momentum',
    name: 'Momentum',
    emoji: '🔥',
    tagline: 'Six weeks of steady progress — a little more every week.',
    description: 'You’ve got the habit — now build on it. Each week nudges the numbers '
      + 'up a little, never a leap: squats get deeper, planks get longer, energy goes up. '
      + 'A great follow-up to Fresh Start, or a starting point if you’re already moving a bit.',
    weeks: 6,
    daysPerWeek: 3,
    minutes: '20–25',
    rest: 45,
    warmup: WARMUP,
    cooldown: COOLDOWN,
    days: expandDays(6, [
      {
        title: 'Lower Body Power',
        blocks: [
          rep('Bodyweight Squat', 3, [10, 12, 14, 15, 18, 20], 'Feet shoulder-width, chest up, sit back.'),
          rep('Reverse Lunge', [2, 2, 3, 3, 3, 3], [8, 10, 10, 12, 12, 14], 'Alternate legs; hold a chair if wobbly.'),
          rep('Glute Bridge', 3, [12, 14, 15, 16, 18, 20], 'Squeeze at the top for a second.'),
          hold('Wall Sit', 2, [20, 25, 30, 35, 40, 45], 'Back flat on the wall. Breathe.'),
          rep('Standing Calf Raise', 2, [15, 15, 15, 18, 18, 20], 'Slow up, slow down.'),
        ],
      },
      {
        title: 'Upper Body & Core',
        blocks: [
          rep('Incline Push-Up', 3, [6, 8, 8, 10, 10, 12], 'Hands on the kitchen counter or couch arm.'),
          rep('Knee Push-Up', 2, [4, 5, 6, 8, 8, 10], 'From the knees, chest toward the floor.'),
          rep('Superman', 3, [10, 10, 12, 12, 14, 15], 'Lift arms and legs, pause, lower gently.'),
          rep('Dead Bug', 3, [10, 10, 12, 12, 14, 15], 'Keep your lower back glued to the floor.'),
          hold('Plank Hold', [2, 2, 2, 3, 3, 3], [20, 25, 30, 30, 35, 40], 'Straight line from head to heels.'),
        ],
      },
      {
        title: 'Full Body Flow',
        blocks: [
          rep('Step-Ups', 3, [10, 12, 12, 14, 14, 16], 'The bottom stair works great. Alternate legs.'),
          rep('Jumping Jacks', 3, [20, 25, 25, 30, 30, 35], 'Step out instead of jumping if you prefer.'),
          rep('Mountain Climbers', 2, [10, 12, 14, 16, 18, 20], 'Count total steps — steady beats fast.'),
          rep('Bird Dog', 3, [8, 10, 10, 12, 12, 14], 'Opposite arm and leg — alternate sides.'),
          hold('Side Plank Hold', 2, [10, 12, 15, 15, 20, 20], 'One set per side. From the knees is fine.'),
        ],
      },
    ]),
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    emoji: '⚡',
    tagline: 'Eight weeks to your strongest self.',
    description: 'The big one. Real push-ups show up, planks reach a full minute, and your '
      + 'legs carry you further every week. Show up three times a week, check the boxes, '
      + 'and let the plan do the thinking.',
    weeks: 8,
    daysPerWeek: 3,
    minutes: '25–30',
    rest: 60,
    warmup: WARMUP,
    cooldown: COOLDOWN,
    days: expandDays(8, [
      {
        title: 'Strong Legs',
        blocks: [
          rep('Bodyweight Squat', 3, [15, 16, 18, 20, 20, 22, 24, 25], 'Feet shoulder-width, chest up, sit back.'),
          rep('Reverse Lunge', 3, [12, 12, 14, 14, 16, 16, 18, 20], 'Alternate legs, knee soft at the bottom.'),
          rep('Glute Bridge', 3, [15, 16, 18, 20, 20, 22, 24, 25], 'Squeeze at the top for a second.'),
          hold('Wall Sit', 2, [30, 35, 40, 45, 50, 55, 60, 60], 'Thighs toward parallel. Breathe.'),
          rep('Standing Calf Raise', 2, [15, 15, 18, 18, 20, 20, 22, 25], 'Slow up, slow down.'),
        ],
      },
      {
        title: 'Upper Body & Core',
        blocks: [
          rep('Knee Push-Up', 3, [8, 9, 10, 11, 12, 13, 14, 15], 'From the knees, chest toward the floor.'),
          rep('Push Up', [1, 1, 1, 2, 2, 2, 3, 3], [3, 4, 5, 5, 6, 7, 8, 8], 'The real deal — even one counts.'),
          rep('Superman', 3, [12, 12, 13, 13, 14, 14, 15, 16], 'Lift arms and legs, pause, lower gently.'),
          rep('Dead Bug', 3, [12, 12, 13, 13, 14, 14, 15, 16], 'Keep your lower back glued to the floor.'),
          hold('Plank Hold', 3, [30, 32, 35, 38, 40, 45, 50, 60], 'Week 8: a full minute. You’ve got this.'),
        ],
      },
      {
        title: 'Sweat & Smile',
        blocks: [
          rep('Jumping Jacks', 3, [30, 30, 35, 35, 40, 40, 45, 50], 'Find a rhythm you can keep.'),
          rep('Mountain Climbers', 3, [16, 18, 20, 22, 24, 26, 28, 30], 'Count total steps — steady beats fast.'),
          rep('Step-Ups', 3, [14, 14, 16, 16, 18, 18, 20, 20], 'Drive through the heel on the stair.'),
          rep('Bird Dog', 3, [12, 12, 12, 14, 14, 14, 16, 16], 'Opposite arm and leg — alternate sides.'),
          hold('Side Plank Hold', 2, [15, 18, 20, 22, 25, 28, 30, 30], 'One set per side. Hips high.'),
        ],
      },
    ]),
  },
];

export function courseById(id) {
  return COURSES.find(c => c.id === id) || null;
}

// "Week 2 · Day 1" for days[idx].
export function dayLabel(course, idx) {
  return `Week ${Math.floor(idx / course.daysPerWeek) + 1} · Day ${(idx % course.daysPerWeek) + 1}`;
}

export function daySetCount(day) {
  return day.blocks.reduce((a, b) => a + b.sets, 0);
}

// "3 × 12" for rep blocks, "2 × 30s" for holds.
export function blockTarget(block) {
  return `${block.sets} × ${block.seconds ? block.seconds + 's' : block.reps}`;
}

// First day not yet completed, or -1 once every day is done. doneDays is the
// stored progress map { dayIndex: 'YYYY-MM-DD' }.
export function nextDayIndex(course, doneDays) {
  for (let i = 0; i < course.days.length; i++) {
    if (!doneDays || !doneDays[i]) return i;
  }
  return -1;
}
