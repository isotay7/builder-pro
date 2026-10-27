// Starting data, loaded only the first time the app opens on a device.
// Exercise: [name, sets, target, kind]  kind: 'reps' | 'time' (seconds) | 'distance' (yards)
window.BP_SEED = {
  workouts: [
    {
      name: 'Upper (chest/shoulder)',
      exercises: [
        ['Incline barbell press', 4, '6-10', 'reps'],
        ['Pull-ups', 3, '6-10', 'reps'],
        ['Seated DB shoulder press', 3, '10-12', 'reps'],
        ['Cable fly', 3, '12-15', 'reps'],
        ['Single-arm cable lateral raise', 4, '12-20', 'reps'],
        ['Curls', 3, '10', 'reps'],
        ['French press', 3, '10-15', 'reps'],
        ['Face pulls', 3, '15-20', 'reps'],
        ['Wrist curls', 3, '12-20', 'reps'],
        ['Reverse curls', 2, '10-15', 'reps'],
      ],
    },
    {
      name: 'Lower (quads)',
      exercises: [
        ['Spanish squat hold', 4, '30-45s', 'time'],
        ['Back squat', 4, '6-10', 'reps'],
        ['Bulgarian split squat', 3, '8-12', 'reps'],
        ['Eccentric decline squat', 3, '8-10', 'reps'],
        ['Leg extensions', 3, '12-15', 'reps'],
        ['Standing calf raise', 3, '10-15', 'reps'],
        ['Back extensions', 3, '12-15', 'reps'],
        ['Hanging leg raises', 3, '15', 'reps'],
        ['Copenhagen plank', 2, '20-30s each side', 'time'],
        ['Tib raises', 2, '15-20', 'reps'],
      ],
    },
    {
      name: 'Upper (back/arms)',
      exercises: [
        ['Bench', 3, '6-10', 'reps'],
        ['Barbell row', 4, '6-10', 'reps'],
        ['Lat pulldown', 3, '10-12', 'reps'],
        ['DB bird dog row', 3, '8', 'reps'],
        ['Lateral raises', 4, '12-20', 'reps'],
        ['Rear delt fly', 3, '15-20', 'reps'],
        ['Overhead cable triceps extension', 3, '10-15', 'reps'],
        ['Hammer curls', 3, '10-15', 'reps'],
        ['Reverse wrist curls', 3, '15-20', 'reps'],
        ["Farmer's carry", 3, '40 yd', 'distance'],
      ],
    },
    {
      name: 'Lower (hamstring/glute)',
      exercises: [
        ['Barbell RDL', 4, '6-10', 'reps'],
        ['Hip thrust machine', 3, '8-12', 'reps'],
        ['Single-leg DB RDL', 3, '8', 'reps'],
        ['Prague squats', 3, '10-16', 'reps'],
        ['Nordic curl', 3, '3-5', 'reps'],
        ['Seated leg curl', 3, '10-15', 'reps'],
        ['Spanish squat hold', 3, '30-45s', 'time'],
        ['Back extensions', 3, '12-15', 'reps'],
      ],
    },
  ],
  // Starts with no history; past sessions are kept privately outside the repo.
  sessions: [],
};
