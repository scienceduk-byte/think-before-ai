"use strict";

const storagePrefix = "think-before-ai:";
const draftKey = "student-v3";
const problemKey = "problems-v1";
const evaluationKey = "evaluations-v1";
const maxProblemFile = 256 * 1024;

const defaultProblem = {
  id: assignment.id, version: 1, title: assignment.title,
  subject: "자료 해석과 인과 추론",
  objectives: "관찰된 변화와 인과 주장을 구분하고, 대안적 설명을 검증할 비교 계획을 설계한다.",
  problem: assignment.problem,
  guidance: "권고, 판단 근거, 해결 전략을 각각 작성하세요.",
  hints: [assignment.hint, "비슷한 집단을 같은 시점에 비교하고, 어떤 결과가 나오면 권고를 바꿀지 정하세요."],
  model: assignment.model,
  independentTitle: assignment.independentTitle,
  independent: assignment.independent,
  independentCriteria: "예약제와 추가 개방의 영향을 구분하는 비교 설계, 측정 지표, 유지 또는 변경의 판단 조건을 확인하세요.",
  studentNumber: assignment.studentNumber,
  rubric: rubric.map(({ id, name, max, levels }) => ({ id, name, max, levels }))
};

const problemFields = [
  ["id", "문제 ID (영문·숫자·밑줄·하이픈)"], ["title", "문제 제목"],
  ["subject", "교과목 또는 학습 영역"], ["objectives", "학습목표", true],
  ["problem", "학습 문제", true], ["guidance", "사전 사고 입력 안내", true],
  ["model", "모범 답변", true], ["independentTitle", "독립 수행 제목"],
  ["independent", "독립 수행 평가 문항", true],
  ["independentCriteria", "독립 수행 문항의 채점 기준", true]
];

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(storagePrefix + key)) ?? fallback; }
  catch { return fallback; }
}

function writeLocal(key, value) {
  try {
    if (value === null) localStorage.removeItem(storagePrefix + key);
    else localStorage.setItem(storagePrefix + key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

function problemText(value, limit = 4000) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

function validateProblem(data) {
  const keys = [...problemFields.map(([key]) => key), "version", "hints", "studentNumber", "rubric"];
  if (!exactObject(data, keys) || !problemFields.every(([key]) => problemText(data[key])) ||
      !/^[A-Za-z0-9_-]{1,60}$/.test(data.id) || !Number.isSafeInteger(data.version) || data.version < 1) {
    throw new Error("문제 ID, 버전과 필수 입력을 확인하세요. 각 항목은 최대 4,000자입니다.");
  }
  if (!Array.isArray(data.hints) || data.hints.length < 1 || data.hints.length > 10 ||
      !data.hints.every(hint => problemText(hint))) throw new Error("힌트를 1~10개 입력하세요.");
  const number = data.studentNumber;
  if (!exactObject(number, ["pattern", "maxLength", "inputMode", "help"]) ||
      !problemText(number.pattern, 120) || !Number.isInteger(number.maxLength) || number.maxLength < 1 || number.maxLength > 40 ||
      !["numeric", "text"].includes(number.inputMode) || !problemText(number.help, 200)) {
    throw new Error("학번 설정을 확인하세요. 최대 길이는 1~40입니다.");
  }
  const token = "(?:[A-Za-z0-9_-]|\\[[A-Za-z0-9_-]+\\])";
  const fixed = new RegExp("^(?:" + token + "(?:\\{[1-9][0-9]?\\})?)+$");
  const range = new RegExp("^" + token + "\\{[1-9][0-9]?,[1-9][0-9]?\\}$");
  if (!fixed.test(number.pattern) && !range.test(number.pattern)) {
    throw new Error("학번 패턴은 문자, 문자 범위와 반복 횟수로 구성하세요. 예: [A-Z][0-9]{7}");
  }
  try { new RegExp("^(?:" + number.pattern + ")$"); }
  catch { throw new Error("학번 패턴이 올바르지 않습니다."); }
  if (!Array.isArray(data.rubric) || data.rubric.length !== rubric.length ||
      !data.rubric.every((area, index) => exactObject(area, ["id", "name", "max", "levels"]) &&
        area.id === rubric[index].id && problemText(area.name, 100) &&
        Number.isInteger(area.max) && area.max > 0 && area.max <= 100 &&
        Array.isArray(area.levels) && area.levels.length === 4 && area.levels.every(level => problemText(level, 1000))) ||
      data.rubric.reduce((sum, area) => sum + area.max, 0) !== 100) {
    throw new Error("네 평가 영역의 이름과 기술문을 입력하고 양의 정수 배점 합계를 100점으로 맞추세요.");
  }
  if (new Blob([JSON.stringify({ type: "think-before-ai-problem", schemaVersion: 1, problem: data }, null, 2)]).size > maxProblemFile) {
    throw new Error("문제 JSON은 최대 256 KiB입니다. 문항 또는 기술문을 줄이세요.");
  }
}

function draftState() {
  return { problem: defaultProblem, studentNumber: "", records: [], draft: {}, started: false, hintsSeen: 0, writingRevision: false };
}

let session = draftState();
try {
  const saved = readLocal(draftKey, null);
  if (saved) {
    validateProblem(saved.problem);
    if (saved.records.length) validateSubmission({ type: "think-before-ai-submission", schemaVersion: 3,
      assignmentId: saved.problem.id, assignmentVersion: saved.problem.version, problem: saved.problem,
      studentNumber: saved.studentNumber, records: saved.records });
    session = { ...draftState(), ...saved };
  }
} catch { /* A damaged local draft must not block starting a new session. */ }

function saveStudent() {
  const saved = writeLocal(draftKey, session);
  $("student-file-status").textContent = saved ? "학습 기록을 이 브라우저에 저장했습니다." : "로컬 저장에 실패했습니다. 기록을 JSON으로 내려받으세요.";
}

function replaceStudent(problem) {
  if ((session.started || session.records.length || Object.keys(session.draft).length) &&
      !window.confirm("현재 학습 기록과 임시 입력을 이 브라우저에서 지우고 새로 시작할까요?")) return;
  session = { ...draftState(), problem };
  saveStudent();
  renderStudent(true);
}

$("student-problem-file").onchange = async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size === 0 || file.size > maxProblemFile) throw new Error("문제 파일은 최대 256 KiB입니다.");
    const packet = JSON.parse(await file.text());
    if (!exactObject(packet, ["type", "schemaVersion", "problem"]) ||
        packet.type !== "think-before-ai-problem" || packet.schemaVersion !== 1) throw new Error("지원하는 문제 JSON 형식이 아닙니다.");
    validateProblem(packet.problem);
    replaceStudent(packet.problem);
  } catch (error) {
    $("student-file-status").textContent = "문제 불러오기 실패 · " + (error instanceof SyntaxError ? "JSON 문법을 확인하세요." : error.message);
  }
};

$("clear-student").onclick = () => {
  if (!window.confirm("이 브라우저에 저장된 학습 기록과 임시 입력을 삭제할까요?")) return;
  session = draftState();
  const cleared = writeLocal(draftKey, null);
  $("student-file-status").textContent = cleared ? "로컬 학습 기록을 삭제했습니다." : "삭제하지 못했습니다. 브라우저의 사이트 데이터 설정을 확인하세요.";
  renderStudent(true);
};

let catalog = readLocal(problemKey, null) ?? { problems: [defaultProblem], versions: { [defaultProblem.id]: 1 } };
let editing = null;
let editorRubric = [];
const problemStatus = $("problem-status");

function problemActionError(error) {
  problemStatus.textContent = error.message;
}

function saveCatalog(next) {
  if (!writeLocal(problemKey, next)) throw new Error("브라우저에 문제를 저장할 수 없습니다. 저장 공간을 확인하세요.");
  catalog = next;
}

function renderProblemList() {
  const list = $("problem-list");
  list.replaceChildren();
  add(list, "option", "문제 선택", { value: "" });
  catalog.problems.forEach(problem => add(list, "option", problem.title + " · " + problem.id + " · v" + problem.version, { value: problem.id }));
  const selected = catalog.problems.some(problem => problem.id === editing);
  list.value = selected ? editing : "";
  for (const id of ["duplicate-problem", "delete-problem", "preview-problem", "export-problem"]) $(id).disabled = !selected;
}

function renderRubricEditor() {
  const content = $("rubric-editor");
  content.replaceChildren();
  editorRubric.forEach((area, index) => {
    const details = add(content, "details");
    add(details, "summary", "평가 영역 " + area.id);
    field(details, "area-name-" + index, "영역명", { type: "text", maxlength: 100, required: "" }, "input").value = area.name;
    field(details, "area-max-" + index, "배점", { type: "number", min: 1, max: 100, step: 1, required: "" }, "input").value = area.max;
    area.levels.forEach((level, i) => {
      field(details, "area-level-" + index + "-" + i, "수준 " + (i + 1) + " 기술문", { maxlength: 1000, required: "" }).value = level;
    });
  });
  updateWeight();
}

function updateWeight() {
  const total = editorRubric.reduce((sum, _, index) => sum + Number($("area-max-" + index).value), 0);
  $("weight-total").textContent = "배점 합계 " + total + " / 100점";
}

function renderHintEditor(hints) {
  const content = $("hint-editor");
  content.replaceChildren();
  hints.forEach((hint, index) => {
    field(content, "hint-" + index, "힌트 " + (index + 1), { maxlength: 4000 }).value = hint;
  });
}

function renderProblemEditor(problem, id = null) {
  editing = id;
  const editor = $("problem-fields");
  editor.replaceChildren();
  problemFields.forEach(([key, label, multi]) => {
    const input = field(editor, "problem-" + key, label, multi ? { maxlength: 4000 } : { maxlength: 4000, type: "text" }, multi ? "textarea" : "input");
    input.value = problem[key] ?? "";
    if (key === "id") input.readOnly = id !== null;
  });
  field(editor, "problem-version", "문제 버전 (기존 문제를 저장하면 자동으로 증가)", { type: "number", min: 1, step: 1 }, "input").value = problem.version ?? 1;
  $("problem-version").readOnly = id !== null;
  $("number-pattern").value = problem.studentNumber.pattern;
  $("number-length").value = problem.studentNumber.maxLength;
  $("number-keyboard").value = problem.studentNumber.inputMode;
  $("number-instructions").value = problem.studentNumber.help;
  $("hint-count").value = problem.hints.length;
  renderHintEditor(problem.hints);
  editorRubric = structuredClone(problem.rubric);
  renderRubricEditor();
  renderProblemList();
  $("problem-preview").hidden = true;
}

function readProblemEditor() {
  const data = Object.fromEntries(problemFields.map(([key]) => [key, $("problem-" + key).value.trim()]));
  const previous = Object.hasOwn(catalog.versions, data.id) ? catalog.versions[data.id] : 0;
  data.version = editing ? previous + 1 : Math.max(previous + 1, Number($("problem-version").value));
  data.hints = [...$("hint-editor").querySelectorAll("textarea")].map(input => input.value.trim());
  data.studentNumber = { pattern: $("number-pattern").value, maxLength: Number($("number-length").value),
    inputMode: $("number-keyboard").value, help: $("number-instructions").value.trim() };
  data.rubric = editorRubric.map(({ id }, index) => ({ id, name: $("area-name-" + index).value.trim(),
    max: Number($("area-max-" + index).value),
    levels: Array.from({ length: 4 }, (_, i) => $("area-level-" + index + "-" + i).value.trim()) }));
  return data;
}

$("problem-list").onchange = event => {
  const problem = catalog.problems.find(item => item.id === event.target.value);
  if (problem) renderProblemEditor(problem, problem.id);
};

$("new-problem").onclick = () => {
  renderProblemEditor({ studentNumber: defaultProblem.studentNumber, hints: [""], rubric: defaultProblem.rubric });
  $("problem-id").focus();
  problemStatus.textContent = "새 문제의 정보를 입력하세요.";
};

$("duplicate-problem").onclick = () => {
  const source = catalog.problems.find(problem => problem.id === editing);
  renderProblemEditor({ ...source, id: "", version: 1, title: source.title + " (복제)" });
  $("problem-id").focus();
  problemStatus.textContent = "복제본에 새 문제 ID를 지정하고 저장하세요.";
};

$("delete-problem").onclick = () => {
  if (!editing || !window.confirm("선택한 문제를 이 브라우저의 문제 목록에서 삭제할까요?")) return;
  try {
    saveCatalog({ ...catalog, problems: catalog.problems.filter(problem => problem.id !== editing) });
    $("new-problem").click();
    problemStatus.textContent = "문제를 삭제했습니다.";
  } catch (error) { problemActionError(error); }
};

$("hint-count").onchange = event => {
  const count = Number(event.target.value);
  if (!Number.isInteger(count) || count < 1 || count > 10) return;
  const hints = [...$("hint-editor").querySelectorAll("textarea")].map(input => input.value);
  if (count < hints.length && hints.slice(count).some(value => value.trim()) &&
      !window.confirm("개수를 줄이면 마지막 힌트가 편집 화면에서 제거됩니다. 계속할까요?")) {
    event.target.value = hints.length;
    return;
  }
  renderHintEditor(Array.from({ length: count }, (_, index) => hints[index] ?? ""));
};

$("rubric-editor").oninput = updateWeight;
$("restore-rubric").onclick = () => {
  editorRubric = structuredClone(defaultProblem.rubric);
  renderRubricEditor();
};

$("problem-form").noValidate = true;
$("problem-form").onsubmit = event => {
  event.preventDefault();
  try {
    if (!Number.isSafeInteger(Number($("problem-version").value)) || Number($("problem-version").value) < 1) throw new Error("문제 버전은 1 이상의 정수입니다.");
    if (Number($("hint-count").value) !== $("hint-editor").querySelectorAll("textarea").length) throw new Error("힌트 개수를 1~10 사이로 지정하세요.");
    const data = readProblemEditor();
    validateProblem(data);
    if (!editing && catalog.problems.some(problem => problem.id === data.id)) throw new Error("이미 사용하는 문제 ID입니다.");
    saveCatalog({ versions: { ...catalog.versions, [data.id]: data.version },
      problems: [...catalog.problems.filter(problem => problem.id !== data.id), data] });
    renderProblemEditor(data, data.id);
    problemStatus.textContent = data.title + " v" + data.version + " 저장 완료";
  } catch (error) { problemActionError(error); }
};

$("preview-problem").onclick = () => {
  const problem = catalog.problems.find(item => item.id === editing);
  const preview = $("problem-preview");
  preview.replaceChildren();
  add(preview, "h3", problem.title + " · v" + problem.version);
  for (const [label, value] of [
    ["교과목", problem.subject], ["학습목표", problem.objectives], ["학습 문제", problem.problem],
    ["사전 사고 입력 안내", problem.guidance], ...problem.hints.map((hint, i) => ["힌트 " + (i + 1), hint]),
    ["모범 답변", problem.model], [problem.independentTitle, problem.independent], ["독립 수행 채점 기준", problem.independentCriteria]
  ]) callout(preview, label, value);
  const areas = add(preview, "ul");
  problem.rubric.forEach(area => {
    const item = add(areas, "li");
    add(item, "h3", area.name + " · " + area.max + "점");
    const levels = add(item, "ol");
    area.levels.forEach(level => add(levels, "li", level));
  });
  preview.hidden = false;
  preview.focus();
};

$("export-problem").onclick = () => {
  const problem = catalog.problems.find(item => item.id === editing);
  download({ type: "think-before-ai-problem", schemaVersion: 1, problem }, problem.id + "-v" + problem.version + ".json");
};

$("review-menu").onchange = event => {
  $("problem-manager").hidden = event.target.value !== "problems";
  $("teacher-assessment").hidden = event.target.value !== "assessment";
};

$("clear-evaluations").onclick = () => {
  if (!window.confirm("이 브라우저에 저장된 교수자 평가와 현재 불러온 학생 기록을 지울까요?")) return;
  if (!writeLocal(evaluationKey, null)) {
    $("import-status").textContent = "평가를 삭제하지 못했습니다.";
    return;
  }
  importAttempt++;
  imported.clear();
  selectedImport = "";
  $("student-search").value = "";
  renderImportList();
  $("record-browser").hidden = true;
  $("import-status").textContent = "로컬 평가와 불러온 학생 기록을 삭제했습니다.";
};

const first = catalog.problems[0];
if (first) renderProblemEditor(first, first.id);
else $("new-problem").click();
renderStudent();
