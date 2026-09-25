const fs = require("fs");
let s = fs.readFileSync("scripts/.tmp-g10-2.cjs", "utf8");
const old = '/courses=\{MAARIF9_KAYNAK_COURSES\.map\(\(c\) => \(\{ \.\.\.c, name: c\.name\.replace\([^\n]*\)\}\)\)\}/, "courses={gradeCourses.map((c) => ({ ...c, name: stripGradePrefix(c.name) }))}"';
const nw = '/courses=\{MAARIF9_KAYNAK_COURSES\.map[^\n]*\n/, "courses={gradeCourses.map((c) => ({ ...c, name: stripGradePrefix(c.name) }))}\n"';
const n = s.split(old).length - 1;
if (n !== 2) throw new Error("count " + n);
fs.writeFileSync("scripts/.tmp-g10-2.cjs", s.split(old).join(nw));
