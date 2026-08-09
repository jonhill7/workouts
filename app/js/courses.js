// Guided classes: preloaded programs marketed like a gym class schedule —
// each program (Pump, Flow, Core, Burn, Total Body) comes in three levels
// (Beginner / Intermediate / Advanced), and every level is a multi-week
// course where each workout day is a ready-made checklist: exercises, sets
// and reps decided in advance, so there is nothing to plan and nothing to
// type. Pure data + helpers (no DOM, no IndexedDB) so the definitions are
// unit-testable under Node.
//
// A block prescribes either `reps` (logged as a weight_reps set at
// bodyweight) or `seconds` (a timed hold, logged as a level_time set whose
// level is the set number). Exercises are matched to the store by name and
// created on demand from COURSE_EXERCISES.

import { currentStreak } from './streaks.js';

export const COURSE_EXERCISES = {
  // legs
  'Chair Squat': { category: 'Legs' },
  'Bodyweight Squat': { category: 'Legs' },
  'Sumo Squat': { category: 'Legs' },
  'Squat Pulse': { category: 'Legs' },
  'Reverse Lunge': { category: 'Legs' },
  'Step-Ups': { category: 'Legs' },
  'Glute Bridge': { category: 'Legs' },
  'Single-Leg Glute Bridge': { category: 'Legs' },
  'Standing Calf Raise': { category: 'Legs' },
  'Wall Sit': { category: 'Legs', timed: true },
  // push
  'Wall Push-Up': { category: 'Chest' },
  'Incline Push-Up': { category: 'Chest' },
  'Knee Push-Up': { category: 'Chest' },
  'Push Up': { category: 'Chest' },
  'Chair Dip': { category: 'Triceps' },
  'Pike Push-Up': { category: 'Shoulders' },
  'Arm Circles': { category: 'Shoulders', timed: true },
  // back
  'Superman': { category: 'Back' },
  'Good Morning': { category: 'Back' },
  // core
  'Bird Dog': { category: 'Abs' },
  'Dead Bug': { category: 'Abs' },
  'Crunch': { category: 'Abs' },
  'Bicycle Crunch': { category: 'Abs' },
  'Russian Twist': { category: 'Abs' },
  'Lying Leg Raise': { category: 'Abs' },
  'Plank Hold': { category: 'Abs', timed: true },
  'Side Plank Hold': { category: 'Abs', timed: true },
  'Hollow Hold': { category: 'Abs', timed: true },
  // cardio
  'Jumping Jacks': { category: 'Cardio' },
  'Mountain Climbers': { category: 'Cardio' },
  'Skater Steps': { category: 'Cardio' },
  'Squat Jumps': { category: 'Cardio' },
  'March in Place': { category: 'Cardio', timed: true },
  'High Knees': { category: 'Cardio', timed: true },
  'Butt Kicks': { category: 'Cardio', timed: true },
  'Fast Feet': { category: 'Cardio', timed: true },
  'Shadow Boxing': { category: 'Cardio', timed: true },
  // stretching & mobility
  'Cat-Cow': { category: 'Stretching' },
  'Shoulder Rolls': { category: 'Stretching' },
  "World's Greatest Stretch": { category: 'Stretching' },
  "Child's Pose": { category: 'Stretching', timed: true },
  'Downward Dog': { category: 'Stretching', timed: true },
  'Cobra Stretch': { category: 'Stretching', timed: true },
  'Hamstring Stretch': { category: 'Stretching', timed: true },
  'Standing Quad Stretch': { category: 'Stretching', timed: true },
  'Hip Flexor Stretch': { category: 'Stretching', timed: true },
  'Figure-Four Stretch': { category: 'Stretching', timed: true },
  'Butterfly Stretch': { category: 'Stretching', timed: true },
  'Seated Twist': { category: 'Stretching', timed: true },
  'Doorway Chest Stretch': { category: 'Stretching', timed: true },
  'Neck Stretch': { category: 'Stretching', timed: true },
  'Single-Leg Balance': { category: 'Stretching', timed: true },
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
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// level(1..3) stamps the shared per-level fields; everything else is passed in.
function course(level, c) {
  return { level, levelLabel: LEVELS[level - 1], rest: 45, warmup: WARMUP, cooldown: COOLDOWN, ...c };
}

export const PROGRAMS = [
  {
    id: 'total-body',
    name: 'Total Body',
    emoji: '💪',
    tagline: 'Strength and energy, head to toe.',
    description: 'The all-round program: full-body strength sessions that take you from '
      + '"it’s been a while" to genuinely strong, one small step per week. If you’re not '
      + 'sure where to start, start here.',
    levels: [
      course(1, {
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
      }),
      course(2, {
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
      }),
      course(3, {
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
      }),
    ],
  },
  {
    id: 'pump',
    name: 'Pump',
    emoji: '🏋️',
    tagline: 'Sculpt and strengthen — the high-rep resistance class, at home.',
    description: 'The group-fitness classic reimagined for your living room: slow, controlled '
      + 'reps and plenty of them, using your own body for resistance. Expect toned legs, arms '
      + 'and shoulders — and that satisfied post-class ache.',
    levels: [
      course(1, {
        id: 'pump-primer',
        name: 'Pump Primer',
        emoji: '🏋️',
        tagline: 'Learn the moves, feel the burn — gently.',
        description: 'Four weeks of sculpting basics: squats, pulses, dips and presses at a friendly pace.',
        weeks: 4,
        daysPerWeek: 3,
        minutes: '15–20',
        days: expandDays(4, [
          {
            title: 'Lower Sculpt',
            blocks: [
              rep('Chair Squat', [2, 2, 3, 3], [10, 12, 12, 14], 'Sit back until you tap the chair, then stand tall.'),
              rep('Glute Bridge', [2, 3, 3, 3], [10, 10, 12, 14], 'Squeeze at the top for a second.'),
              rep('Squat Pulse', 2, [8, 10, 12, 14], 'Stay low and pulse — tiny bounces.'),
              rep('Standing Calf Raise', 2, [12, 14, 15, 16], 'Slow up, slow down.'),
              hold('Wall Sit', 1, [20, 25, 30, 35], 'Back flat on the wall. Breathe.'),
            ],
          },
          {
            title: 'Upper Sculpt',
            blocks: [
              rep('Wall Push-Up', [2, 2, 3, 3], [10, 12, 12, 14], 'Hands on the wall, body in one straight line.'),
              rep('Chair Dip', 2, [6, 8, 8, 10], 'Hands on a sturdy chair, elbows point straight back.'),
              hold('Arm Circles', 2, [20, 25, 30, 30], 'Arms straight out — small circles, both directions.'),
              rep('Superman', 2, [8, 10, 10, 12], 'Lift arms and legs, pause, lower gently.'),
              hold('Plank Hold', 2, [15, 20, 20, 25], 'Knees down is a real plank too.'),
            ],
          },
          {
            title: 'Full Body Pump',
            blocks: [
              rep('Sumo Squat', [2, 2, 3, 3], [10, 10, 12, 12], 'Wide stance, toes out, knees over toes.'),
              rep('Incline Push-Up', 2, [6, 8, 8, 10], 'Hands on the kitchen counter or couch arm.'),
              rep('Reverse Lunge', 2, [8, 8, 10, 12], 'Alternate legs; hold a chair if wobbly.'),
              rep('Good Morning', 2, [10, 10, 12, 12], 'Hands on hips, hinge forward with a flat back.'),
              rep('Glute Bridge', 2, [10, 12, 12, 14], 'Squeeze at the top for a second.'),
            ],
          },
        ]),
      }),
      course(2, {
        id: 'pump-power',
        name: 'Pump Power',
        emoji: '🏋️',
        tagline: 'More reps, new moves, real definition.',
        description: 'Six weeks of higher-volume sculpting — pike push-ups and single-leg work join the party.',
        weeks: 6,
        daysPerWeek: 3,
        minutes: '20–25',
        days: expandDays(6, [
          {
            title: 'Lower Sculpt',
            blocks: [
              rep('Bodyweight Squat', 3, [12, 14, 15, 16, 18, 20], 'Feet shoulder-width, chest up, sit back.'),
              rep('Sumo Squat', 3, [10, 12, 12, 14, 14, 16], 'Wide stance, toes out, squeeze inner thighs up.'),
              rep('Single-Leg Glute Bridge', 2, [6, 8, 8, 10, 10, 12], 'One set per leg — hips stay level.'),
              rep('Squat Pulse', 2, [12, 14, 16, 18, 20, 20], 'Stay low and pulse — tiny bounces.'),
              hold('Wall Sit', 2, [25, 30, 30, 35, 40, 45], 'Back flat on the wall. Breathe.'),
            ],
          },
          {
            title: 'Upper Sculpt',
            blocks: [
              rep('Incline Push-Up', 3, [8, 8, 10, 10, 12, 12], 'Hands on the kitchen counter or couch arm.'),
              rep('Chair Dip', 3, [8, 8, 10, 10, 12, 14], 'Elbows point straight back, shoulders away from ears.'),
              rep('Pike Push-Up', 2, [4, 5, 6, 6, 8, 8], 'Hips high, look at your toes — shoulders do the work.'),
              hold('Arm Circles', 2, [30, 35, 40, 40, 45, 45], 'Small circles, both directions — it adds up!'),
              hold('Plank Hold', 2, [25, 30, 30, 35, 40, 45], 'Straight line from head to heels.'),
            ],
          },
          {
            title: 'Full Body Pump',
            blocks: [
              rep('Reverse Lunge', 3, [10, 10, 12, 12, 14, 16], 'Alternate legs, knee soft at the bottom.'),
              rep('Knee Push-Up', 3, [6, 8, 8, 10, 10, 12], 'From the knees, chest toward the floor.'),
              rep('Good Morning', 3, [12, 12, 14, 14, 15, 16], 'Hinge at the hips, flat back, feel the hamstrings.'),
              rep('Glute Bridge', 3, [12, 14, 15, 16, 18, 20], 'Squeeze at the top for a second.'),
              rep('Superman', 3, [10, 10, 12, 12, 14, 15], 'Lift arms and legs, pause, lower gently.'),
            ],
          },
        ]),
      }),
      course(3, {
        id: 'pump-peak',
        name: 'Pump Peak',
        emoji: '🏋️',
        tagline: 'The full class experience — every muscle, every week.',
        description: 'Eight weeks at full volume: real push-ups, deep pulses and long holds. Bring a water bottle.',
        weeks: 8,
        daysPerWeek: 3,
        minutes: '25–30',
        rest: 60,
        days: expandDays(8, [
          {
            title: 'Lower Sculpt',
            blocks: [
              rep('Bodyweight Squat', 3, [16, 18, 20, 22, 24, 25, 26, 28], 'Feet shoulder-width, chest up, sit back.'),
              rep('Reverse Lunge', 3, [12, 14, 14, 16, 16, 18, 18, 20], 'Alternate legs, knee soft at the bottom.'),
              rep('Single-Leg Glute Bridge', 3, [8, 8, 10, 10, 12, 12, 14, 14], 'One set per leg — hips stay level.'),
              rep('Squat Pulse', 3, [16, 18, 20, 20, 22, 24, 25, 26], 'Stay low and pulse — embrace the burn.'),
              hold('Wall Sit', 2, [35, 40, 45, 50, 50, 55, 60, 60], 'Thighs toward parallel. Breathe.'),
            ],
          },
          {
            title: 'Upper Sculpt',
            blocks: [
              rep('Knee Push-Up', 3, [10, 10, 12, 12, 14, 14, 15, 16], 'From the knees, chest toward the floor.'),
              rep('Push Up', 2, [4, 5, 6, 6, 8, 8, 10, 10], 'The real deal — even a few count.'),
              rep('Chair Dip', 3, [10, 10, 12, 12, 14, 14, 15, 16], 'Elbows point straight back.'),
              rep('Pike Push-Up', 2, [6, 6, 8, 8, 10, 10, 12, 12], 'Hips high — shoulders do the work.'),
              hold('Plank Hold', 3, [30, 35, 40, 40, 45, 50, 55, 60], 'Straight line from head to heels.'),
            ],
          },
          {
            title: 'Full Body Pump',
            blocks: [
              rep('Sumo Squat', 3, [14, 16, 16, 18, 18, 20, 22, 24], 'Wide stance, toes out.'),
              rep('Incline Push-Up', 3, [10, 12, 12, 14, 14, 15, 16, 18], 'Lower slowly — two counts down.'),
              rep('Good Morning', 3, [14, 14, 15, 16, 16, 18, 18, 20], 'Hinge at the hips, flat back.'),
              rep('Glute Bridge', 3, [16, 18, 18, 20, 20, 22, 24, 25], 'Squeeze at the top for a second.'),
              rep('Superman', 3, [12, 12, 14, 14, 15, 16, 16, 18], 'Lift arms and legs, pause, lower gently.'),
            ],
          },
        ]),
      }),
    ],
  },
  {
    id: 'flow',
    name: 'Flow',
    emoji: '🧘',
    tagline: 'Stretch, breathe, unwind — mobility for a body that sits all day.',
    description: 'Slow, feel-good sessions borrowed from yoga and physio: open your hips, ease '
      + 'your back and shoulders, and finish standing taller than you started. Perfect for rest '
      + 'days, evenings, or any day that needs a reset.',
    levels: [
      course(1, {
        id: 'gentle-flow',
        name: 'Gentle Flow',
        emoji: '🧘',
        tagline: 'Easy stretches, big sighs of relief.',
        description: 'Four weeks of short, gentle sessions — nothing fancy, everything comfortable.',
        weeks: 4,
        daysPerWeek: 3,
        minutes: '10–15',
        rest: 15,
        warmup: 'No warm-up needed — ease into each stretch, never push into pain, and breathe slowly.',
        cooldown: 'Done — take three deep breaths and notice how much looser you feel.',
        days: expandDays(4, [
          {
            title: 'Wake & Shake',
            blocks: [
              rep('Cat-Cow', 1, [6, 8, 8, 10], 'On all fours — arch and round along with your breath.'),
              rep('Shoulder Rolls', 1, [10, 10, 12, 12], 'Big slow circles, backwards and forwards.'),
              hold('Downward Dog', 2, [15, 20, 20, 25], 'Pedal your feet; bend your knees as much as you like.'),
              hold('Standing Quad Stretch', 2, [15, 20, 20, 25], 'One side per set — hold the wall.'),
              hold("Child's Pose", 1, [30, 30, 40, 45], 'Sink back, arms long, slow breaths.'),
            ],
          },
          {
            title: 'Hips & Hamstrings',
            blocks: [
              hold('Hamstring Stretch', 2, [15, 20, 20, 25], 'One side per set — soft knee, hinge forward.'),
              hold('Hip Flexor Stretch', 2, [15, 20, 20, 25], 'Half-kneel, tuck your tail, lean gently forward.'),
              hold('Figure-Four Stretch', 2, [15, 20, 20, 25], 'Ankle over knee — one side per set.'),
              hold('Butterfly Stretch', 1, [30, 30, 40, 45], 'Soles together, let the knees drop.'),
              rep('Cat-Cow', 1, [6, 8, 8, 10], 'Finish by moving with your breath.'),
            ],
          },
          {
            title: 'Neck, Back & Shoulders',
            blocks: [
              hold('Neck Stretch', 2, [15, 15, 20, 20], 'Ear toward shoulder — one side per set.'),
              hold('Doorway Chest Stretch', 2, [20, 20, 25, 30], 'Forearm on the door frame, step gently through.'),
              hold('Seated Twist', 2, [15, 20, 20, 25], 'Sit tall, twist from the middle — one side per set.'),
              hold('Cobra Stretch', 2, [15, 15, 20, 25], 'Hips stay down, chest lifts.'),
              hold("Child's Pose", 1, [30, 40, 40, 45], 'Sink back, arms long, slow breaths.'),
            ],
          },
        ]),
      }),
      course(2, {
        id: 'deep-flow',
        name: 'Deep Flow',
        emoji: '🧘',
        tagline: 'Longer holds, deeper release.',
        description: 'Six weeks that add balance work and the world’s greatest stretch, holding everything a little longer.',
        weeks: 6,
        daysPerWeek: 3,
        minutes: '15–20',
        rest: 15,
        warmup: 'No warm-up needed — ease into each stretch, never push into pain, and breathe slowly.',
        cooldown: 'Done — take three deep breaths and notice how much looser you feel.',
        days: expandDays(6, [
          {
            title: 'Wake & Shake',
            blocks: [
              rep('Cat-Cow', 1, [8, 10, 10, 12, 12, 12], 'Move with your breath.'),
              rep("World's Greatest Stretch", 1, [4, 4, 6, 6, 8, 8], 'Lunge, twist, reach — alternate sides.'),
              hold('Downward Dog', 2, [20, 25, 25, 30, 30, 35], 'Pedal your feet, breathe into the backs of your legs.'),
              hold('Standing Quad Stretch', 2, [20, 25, 25, 30, 30, 35], 'One side per set.'),
              hold('Single-Leg Balance', 2, [15, 20, 20, 25, 25, 30], 'One side per set — fingertips on the wall if needed.'),
            ],
          },
          {
            title: 'Hips & Hamstrings',
            blocks: [
              hold('Hamstring Stretch', 2, [25, 25, 30, 30, 35, 40], 'One side per set.'),
              hold('Hip Flexor Stretch', 2, [25, 25, 30, 30, 35, 40], 'Tuck your tail, lean gently forward.'),
              hold('Figure-Four Stretch', 2, [25, 25, 30, 30, 35, 40], 'One side per set.'),
              hold('Butterfly Stretch', 1, [40, 45, 50, 55, 60, 60], 'Let gravity do the work.'),
              hold('Downward Dog', 2, [20, 20, 25, 25, 30, 30], 'Finish long and loose.'),
            ],
          },
          {
            title: 'Neck, Back & Shoulders',
            blocks: [
              hold('Neck Stretch', 2, [20, 20, 25, 25, 30, 30], 'One side per set — gentle.'),
              hold('Doorway Chest Stretch', 2, [25, 25, 30, 30, 35, 40], 'Step through until you feel it open.'),
              hold('Seated Twist', 2, [25, 25, 30, 30, 35, 40], 'One side per set.'),
              hold('Cobra Stretch', 2, [20, 25, 25, 30, 30, 35], 'Hips down, chest proud.'),
              hold("Child's Pose", 1, [45, 45, 50, 55, 60, 60], 'Melt into the floor.'),
            ],
          },
        ]),
      }),
      course(3, {
        id: 'flow-state',
        name: 'Flow State',
        emoji: '🧘',
        tagline: 'Long, luxurious holds — full-body freedom.',
        description: 'Eight weeks of the deep stuff: minute-long holds, steadier balance, noticeably freer movement.',
        weeks: 8,
        daysPerWeek: 3,
        minutes: '20–25',
        rest: 15,
        warmup: 'No warm-up needed — ease into each stretch, never push into pain, and breathe slowly.',
        cooldown: 'Done — take three deep breaths and notice how much looser you feel.',
        days: expandDays(8, [
          {
            title: 'Wake & Shake',
            blocks: [
              rep('Cat-Cow', 1, [10, 10, 12, 12, 12, 14, 14, 15], 'Move with your breath.'),
              rep("World's Greatest Stretch", 1, [6, 6, 8, 8, 8, 10, 10, 12], 'Lunge, twist, reach — alternate sides.'),
              hold('Downward Dog', 2, [30, 30, 35, 35, 40, 40, 45, 45], 'Long spine, heavy heels.'),
              hold('Single-Leg Balance', 2, [25, 30, 30, 35, 35, 40, 45, 45], 'One side per set — eyes on one spot.'),
              hold('Standing Quad Stretch', 2, [30, 30, 35, 35, 40, 40, 45, 45], 'One side per set.'),
            ],
          },
          {
            title: 'Hips & Hamstrings',
            blocks: [
              hold('Hamstring Stretch', 2, [35, 35, 40, 40, 45, 45, 50, 60], 'One side per set — breathe into it.'),
              hold('Hip Flexor Stretch', 2, [35, 35, 40, 40, 45, 45, 50, 60], 'Tuck your tail, lean gently forward.'),
              hold('Figure-Four Stretch', 2, [35, 35, 40, 40, 45, 45, 50, 60], 'One side per set.'),
              hold('Butterfly Stretch', 2, [30, 35, 35, 40, 40, 45, 45, 50], 'Let gravity do the work.'),
              hold('Downward Dog', 2, [30, 30, 35, 35, 40, 40, 45, 45], 'Finish long and loose.'),
            ],
          },
          {
            title: 'Neck, Back & Shoulders',
            blocks: [
              hold('Neck Stretch', 2, [25, 25, 30, 30, 30, 35, 35, 40], 'One side per set — gentle.'),
              hold('Doorway Chest Stretch', 2, [35, 35, 40, 40, 45, 45, 50, 50], 'Open up — undo the desk.'),
              hold('Seated Twist', 2, [35, 35, 40, 40, 45, 45, 50, 50], 'One side per set.'),
              hold('Cobra Stretch', 2, [30, 30, 35, 35, 40, 40, 45, 45], 'Hips down, chest proud.'),
              hold("Child's Pose", 1, [60, 60, 60, 75, 75, 90, 90, 90], 'Stay a while.'),
            ],
          },
        ]),
      }),
    ],
  },
  {
    id: 'core',
    name: 'Core',
    emoji: '🎯',
    tagline: 'A stronger middle — better posture, a happier back.',
    description: 'Short, focused sessions for the muscles everything else hangs on. Deep core '
      + 'strength shows up everywhere: carrying groceries, sitting taller, a back that '
      + 'complains less.',
    levels: [
      course(1, {
        id: 'core-foundations',
        name: 'Core Foundations',
        emoji: '🎯',
        tagline: 'Wake up the deep muscles, gently.',
        description: 'Four weeks of core basics — short sessions, zero crunching until you’re ready.',
        weeks: 4,
        daysPerWeek: 3,
        minutes: '8–12',
        days: expandDays(4, [
          {
            title: 'Deep Core',
            blocks: [
              rep('Dead Bug', 2, [8, 10, 10, 12], 'Keep your lower back glued to the floor.'),
              rep('Glute Bridge', 2, [10, 12, 12, 15], 'Squeeze at the top for a second.'),
              rep('Bird Dog', 2, [6, 8, 8, 10], 'Opposite arm and leg — slow and steady.'),
              hold('Plank Hold', 2, [15, 20, 20, 25], 'Knees down is a real plank too.'),
            ],
          },
          {
            title: 'Crunch Time',
            blocks: [
              rep('Crunch', 2, [10, 12, 12, 15], 'Small and controlled — chin off your chest.'),
              rep('Lying Leg Raise', 2, [6, 8, 8, 10], 'Knees bent is fine — lower slowly.'),
              rep('Russian Twist', 2, [10, 12, 12, 14], 'Total twists, feet on the floor.'),
              hold('Side Plank Hold', 2, [10, 12, 15, 15], 'One side per set. From the knees is fine.'),
            ],
          },
          {
            title: 'Back & Balance',
            blocks: [
              rep('Superman', 2, [8, 10, 10, 12], 'Lift arms and legs, pause, lower gently.'),
              rep('Bird Dog', 2, [8, 8, 10, 10], 'Slow and steady wins here.'),
              rep('Glute Bridge', 2, [12, 12, 14, 15], 'Squeeze at the top.'),
              hold('Plank Hold', 2, [15, 20, 25, 25], 'Straight line, steady breath.'),
            ],
          },
        ]),
      }),
      course(2, {
        id: 'core-circuit',
        name: 'Core Circuit',
        emoji: '🎯',
        tagline: 'Hollow holds and bicycles — the good stuff.',
        description: 'Six weeks stepping up to the classics: hollow holds, bicycle crunches and longer planks.',
        weeks: 6,
        daysPerWeek: 3,
        minutes: '10–15',
        days: expandDays(6, [
          {
            title: 'Deep Core',
            blocks: [
              rep('Dead Bug', 3, [10, 10, 12, 12, 14, 15], 'Lower back pressed down throughout.'),
              hold('Hollow Hold', 2, [10, 12, 15, 15, 20, 20], 'Bend your knees to make it kinder.'),
              rep('Bird Dog', 3, [8, 10, 10, 12, 12, 14], 'Opposite arm and leg — alternate sides.'),
              hold('Plank Hold', 2, [25, 30, 30, 35, 40, 45], 'Straight line from head to heels.'),
            ],
          },
          {
            title: 'Crunch Time',
            blocks: [
              rep('Bicycle Crunch', 2, [12, 14, 16, 18, 20, 20], 'Total — slow and controlled beats fast.'),
              rep('Lying Leg Raise', 2, [8, 10, 10, 12, 12, 14], 'Lower slowly — that’s the good part.'),
              rep('Russian Twist', 2, [14, 16, 16, 18, 20, 22], 'Total twists — lift your feet to level up.'),
              hold('Side Plank Hold', 2, [15, 15, 20, 20, 25, 25], 'One side per set. Hips high.'),
            ],
          },
          {
            title: 'Back & Balance',
            blocks: [
              rep('Superman', 3, [10, 10, 12, 12, 14, 15], 'Pause at the top.'),
              rep('Glute Bridge', 3, [12, 14, 14, 16, 18, 20], 'Squeeze at the top.'),
              rep('Mountain Climbers', 2, [12, 14, 16, 18, 20, 20], 'Count total steps — core stays tight.'),
              hold('Plank Hold', 2, [30, 30, 35, 40, 40, 45], 'Steady breath.'),
            ],
          },
        ]),
      }),
      course(3, {
        id: 'core-crush',
        name: 'Core Crush',
        emoji: '🎯',
        tagline: 'Minute-long planks and a core of steel.',
        description: 'Eight weeks to a seriously strong middle — planks reach a minute and everything gets harder, gradually.',
        weeks: 8,
        daysPerWeek: 3,
        minutes: '12–18',
        rest: 60,
        days: expandDays(8, [
          {
            title: 'Deep Core',
            blocks: [
              rep('Dead Bug', 3, [12, 12, 14, 14, 15, 16, 16, 18], 'Slow, precise, controlled.'),
              hold('Hollow Hold', 3, [15, 15, 20, 20, 25, 25, 30, 30], 'Lower back pressed down.'),
              rep('Bird Dog', 3, [12, 12, 14, 14, 15, 16, 16, 18], 'Pause at full stretch.'),
              hold('Plank Hold', 3, [30, 35, 35, 40, 45, 50, 55, 60], 'Week 8: one full minute.'),
            ],
          },
          {
            title: 'Crunch Time',
            blocks: [
              rep('Bicycle Crunch', 3, [16, 18, 20, 20, 22, 24, 26, 28], 'Total — slow and controlled.'),
              rep('Lying Leg Raise', 3, [10, 12, 12, 14, 14, 15, 16, 16], 'Straighter legs = harder.'),
              rep('Russian Twist', 3, [18, 20, 20, 22, 24, 26, 28, 30], 'Feet up if you can.'),
              hold('Side Plank Hold', 2, [20, 22, 25, 25, 28, 30, 30, 35], 'One side per set. Hips high.'),
            ],
          },
          {
            title: 'Back & Balance',
            blocks: [
              rep('Superman', 3, [12, 12, 14, 14, 15, 16, 16, 18], 'Pause at the top.'),
              rep('Glute Bridge', 3, [16, 18, 18, 20, 22, 24, 25, 26], 'Squeeze at the top.'),
              rep('Mountain Climbers', 3, [16, 18, 20, 22, 24, 26, 28, 30], 'Core tight, hips level.'),
              hold('Plank Hold', 3, [35, 35, 40, 45, 45, 50, 55, 60], 'Strong to the last second.'),
            ],
          },
        ]),
      }),
    ],
  },
  {
    id: 'burn',
    name: 'Burn',
    emoji: '❤️‍🔥',
    tagline: 'Feel-good cardio — heart up, mood up, no equipment.',
    description: 'The energy class: light-on-your-feet intervals that raise your heart rate and '
      + 'get the endorphins flowing. Every move has a low-impact option, so you set the intensity.',
    levels: [
      course(1, {
        id: 'slow-burn',
        name: 'Slow Burn',
        emoji: '❤️‍🔥',
        tagline: 'Get moving, get breathing, get happy.',
        description: 'Four weeks of gentle cardio — marching, stepping and light intervals that build up kindly.',
        weeks: 4,
        daysPerWeek: 3,
        minutes: '12–18',
        days: expandDays(4, [
          {
            title: 'Heart Starter',
            blocks: [
              hold('March in Place', 2, [45, 60, 60, 75], 'Lift those knees, swing those arms.'),
              rep('Jumping Jacks', 2, [12, 15, 15, 20], 'Step out instead of jumping any time.'),
              hold('Shadow Boxing', 2, [20, 25, 30, 30], 'Loose fists, quick light punches.'),
              rep('Step-Ups', 2, [10, 10, 12, 12], 'The bottom stair works great.'),
            ],
          },
          {
            title: 'Move & Groove',
            blocks: [
              hold('Butt Kicks', 2, [20, 20, 25, 30], 'Heels toward your seat — march it if you like.'),
              hold('High Knees', 2, [15, 20, 20, 25], 'March them high if jogging feels like a lot.'),
              rep('Skater Steps', 2, [8, 10, 10, 12], 'Step side to side — no need to hop.'),
              hold('Wall Sit', 1, [20, 20, 25, 30], 'Catch your breath — while your legs work.'),
            ],
          },
          {
            title: 'Sweat & Smile',
            blocks: [
              rep('Jumping Jacks', 2, [15, 15, 20, 20], 'Find a rhythm you can keep.'),
              hold('Fast Feet', 2, [10, 15, 15, 20], 'Quick little steps, stay low.'),
              rep('Mountain Climbers', 2, [8, 10, 10, 12], 'Count total steps — steady beats fast.'),
              hold('March in Place', 1, [60, 75, 90, 90], 'Bring it home strong.'),
            ],
          },
        ]),
      }),
      course(2, {
        id: 'steady-burn',
        name: 'Steady Burn',
        emoji: '❤️‍🔥',
        tagline: 'Longer intervals, bigger endorphins.',
        description: 'Six weeks of proper sweat sessions — intervals stretch out and your engine grows with them.',
        weeks: 6,
        daysPerWeek: 3,
        minutes: '18–25',
        days: expandDays(6, [
          {
            title: 'Heart Starter',
            blocks: [
              rep('Jumping Jacks', 3, [20, 20, 25, 25, 30, 30], 'Step out instead of jumping any time.'),
              hold('Shadow Boxing', 3, [30, 30, 35, 40, 40, 45], 'Mix jabs, crosses and hooks.'),
              hold('High Knees', 2, [20, 25, 25, 30, 30, 35], 'Drive the knees, pump the arms.'),
              rep('Step-Ups', 3, [12, 12, 14, 14, 16, 16], 'Drive through the heel.'),
            ],
          },
          {
            title: 'Move & Groove',
            blocks: [
              hold('Butt Kicks', 3, [25, 25, 30, 30, 35, 40], 'Light on your feet.'),
              rep('Skater Steps', 3, [10, 12, 12, 14, 16, 16], 'Add a little hop when you feel bouncy.'),
              rep('Mountain Climbers', 2, [12, 14, 16, 16, 18, 20], 'Count total steps.'),
              hold('Wall Sit', 2, [20, 25, 25, 30, 30, 35], 'Active recovery — legs on, breath slow.'),
            ],
          },
          {
            title: 'Sweat & Smile',
            blocks: [
              hold('Fast Feet', 3, [15, 20, 20, 25, 25, 30], 'Quick little steps, stay low.'),
              rep('Jumping Jacks', 3, [20, 25, 25, 30, 30, 35], 'Find a rhythm you can keep.'),
              hold('High Knees', 2, [25, 25, 30, 30, 35, 40], 'Finish each round strong.'),
              hold('March in Place', 1, [90, 90, 105, 105, 120, 120], 'Cool the engine down slowly.'),
            ],
          },
        ]),
      }),
      course(3, {
        id: 'inferno',
        name: 'Inferno',
        emoji: '❤️‍🔥',
        tagline: 'The big finisher — intervals that mean business.',
        description: 'Eight weeks of serious cardio: squat jumps arrive, intervals reach a minute, and hills stop being scary.',
        weeks: 8,
        daysPerWeek: 3,
        minutes: '25–30',
        rest: 60,
        days: expandDays(8, [
          {
            title: 'Heart Starter',
            blocks: [
              rep('Jumping Jacks', 3, [30, 30, 35, 35, 40, 45, 45, 50], 'Find a rhythm you can keep.'),
              hold('High Knees', 3, [30, 30, 35, 35, 40, 40, 45, 45], 'Drive the knees, pump the arms.'),
              hold('Shadow Boxing', 3, [40, 45, 45, 50, 50, 55, 60, 60], 'Stay light, keep the hands moving.'),
              rep('Squat Jumps', 2, [6, 8, 8, 10, 10, 12, 12, 14], 'Land soft — swap in squats any round.'),
            ],
          },
          {
            title: 'Move & Groove',
            blocks: [
              rep('Skater Steps', 3, [14, 16, 16, 18, 20, 22, 24, 25], 'Bound side to side, arms swinging.'),
              hold('Butt Kicks', 3, [30, 35, 35, 40, 40, 45, 45, 50], 'Quick heels, tall posture.'),
              rep('Mountain Climbers', 3, [18, 20, 22, 24, 26, 28, 30, 32], 'Count total steps — hips level.'),
              hold('Wall Sit', 2, [30, 35, 35, 40, 45, 45, 50, 60], 'Active recovery — breathe.'),
            ],
          },
          {
            title: 'Sweat & Smile',
            blocks: [
              hold('Fast Feet', 3, [25, 30, 30, 35, 35, 40, 45, 45], 'As quick as you can, stay low.'),
              rep('Squat Jumps', 2, [6, 6, 8, 8, 10, 10, 12, 12], 'Land soft, sink deep.'),
              rep('Jumping Jacks', 3, [35, 35, 40, 40, 45, 45, 50, 50], 'Big and bouncy.'),
              hold('High Knees', 3, [30, 35, 35, 40, 40, 45, 50, 50], 'Empty the tank — you earned the shower.'),
            ],
          },
        ]),
      }),
    ],
  },
];

export const COURSES = PROGRAMS.flatMap(p => p.levels);

export function programById(id) {
  return PROGRAMS.find(p => p.id === id) || null;
}

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

export function programOfCourse(courseId) {
  return PROGRAMS.find(p => p.levels.some(c => c.id === courseId)) || null;
}

// Completion dates ascending. Duplicates are kept on purpose: two workouts
// finished on the same day are two completions, matching routine streaks.
export function courseDoneDates(doneDays) {
  return Object.values(doneDays || {}).sort();
}

// Momentum: length of the completion chain ending near `today`, using the
// same gap rule as routine streaks (dead after MAX_GAP_DAYS without one).
export function courseStreak(doneDays, today) {
  return currentStreak(courseDoneDates(doneDays), today);
}

// Workouts completed in the calendar week (Mon–Sun) containing `today` —
// shown against the course's days-per-week target.
export function weekCount(doneDays, today) {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const monday = d.toISOString().slice(0, 10);
  return courseDoneDates(doneDays).filter(x => x >= monday && x <= today).length;
}
