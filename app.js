"use strict";

const stages = [
  { name: "최초 사고", button: "최초 사고 제출 및 힌트 보기", fields: {
    thought: "최초 생각 · 어떤 결정을 권고하나요?",
    evidence: "판단 근거 · 어떤 자료나 가정에 근거했나요?",
    strategy: "해결 전략 · 무엇을 어떻게 확인하겠나요?"
  }},
  { name: "힌트 후 수정", button: "수정 기록 제출 및 모범 답변 보기", fields: {
    revision: "최종 설명 · 힌트를 검토한 뒤 수정하거나 유지한 판단을 근거와 함께 설명하세요.",
    reason: "수정 이유 · 무엇을 바꿨거나 유지했으며 그 이유는 무엇인가요?"
  }},
  { name: "모범 답변 비교", button: "비교 기록 제출 및 독립 수행 시작", fields: {
    comparison: "비교와 차이점 · 수용한 내용, 동의하지 않는 내용(없다면 없음)과 각 판단의 이유를 적으세요."
  }},
  { name: "독립 수행", button: "독립 수행 답변 제출", fields: {
    answer: "독립 수행 답변 · 권고, 검증 방법, 최종 판단 조건을 작성하세요."
  }}
];

const rubric = [
  { id: "A", name: "개념 이해", max: 25, evidence: [
    [0, "thought", "최초 답변"], [1, "revision", "최종 설명 (힌트 후 수정·유지)"], [3, "answer", "힌트 없는 독립 수행 답변"]
  ], levels: [
    "핵심 개념을 설명하지 못하거나 중대한 오류가 있다.",
    "일부 개념을 이해하지만 오류나 누락이 있다.",
    "핵심 개념을 대체로 정확하게 설명한다.",
    "핵심 개념을 정확하게 설명하고 관련 개념과 연결한다."
  ]},
  { id: "B", name: "논리적 추론", max: 20, evidence: [
    [0, "thought", "최초 주장"], [0, "evidence", "판단 근거"], [0, "strategy", "해결 전략"]
  ], levels: [
    "주장에 대한 타당한 근거를 제시하지 못한다.",
    "근거가 불충분하거나 추론 과정에 비약이 있다.",
    "주장과 근거가 연결되지만 일부 설명이 부족하다.",
    "주장과 근거가 명확하며 타당한 추론을 전개한다."
  ]},
  { id: "C", name: "비판적 판단", max: 20, evidence: [
    [1, "revision", "힌트 확인 후 수정·유지 내용"], [2, "comparison", "모범 답변과의 비교"], [1, "reason", "수정하거나 유지한 이유"]
  ], levels: [
    "답변을 그대로 수용하거나 검토 근거를 제시하지 못한다.",
    "힌트를 반영하지만 판단 근거가 불명확하다.",
    "힌트와 모범 답변을 검토하고 판단의 이유를 설명한다.",
    "힌트와 모범 답변을 검증하고 타당한 근거를 들어 자신의 판단을 수정하거나 유지한다."
  ]},
  { id: "D", name: "독립적 문제해결", max: 35, evidence: [
    [3, "answer", "새로운 문제에 대한 독립 수행 답변"]
  ], levels: [
    "스스로 해결 방법을 제시하지 못한다.",
    "일부 해결하지만 개념 적용이나 설명에 오류가 있다.",
    "새로운 문제를 대체로 해결하고 주요 근거를 제시한다.",
    "새로운 상황에 개념을 정확히 적용하고 해결 과정을 설명한다."
  ]}
];

const statusLabels = {
  missing: "미제출", unavailable: "평가 불가", pending: "미평가", scored: "평가 완료"
};

const $ = id => document.getElementById(id);
const maxText = 12000;
const maxFile = 1024 * 1024;
const submissionVersion = 3;
const imported = new Map();
let selectedImport = "";
let importAttempt = 0;
const personalFileNotice = "학번과 답변 또는 평가를 담은 개인정보 파일입니다. 지정된 제출 경로로만 전달하고 공개 저장소나 발표 자료에 올리지 마세요.";
const researchFileNotice = "연구·발표용 파일은 학번과 기록 시각을 제외합니다. 원문과 메모에 이름이나 다른 식별 정보가 있는지 공유 전에 확인하세요.";

function add(parent, tag, text, options = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(options)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}

function callout(parent, heading, message) {
  const panel = add(parent, "section", undefined, { class: "callout" });
  add(panel, "h3", heading);
  add(panel, "p", message);
}

function field(parent, key, label, attributes = {}, tag = "textarea") {
  add(parent, "label", label, { for: key });
  return add(parent, tag, undefined, { id: key, name: key, maxlength: maxText, ...attributes });
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("ko-KR");
}

function recordDetails(parent, records) {
  records.forEach(({ submittedAt, answers }, index) => {
    const section = add(parent, "details");
    section.open = true;
    add(section, "summary", stages[index].name + " · " + formatDate(submittedAt));
    for (const [key, label] of Object.entries(stages[index].fields)) {
      add(section, "h3", label);
      add(section, "p", answers[key], { class: "record" });
    }
  });
}

function validLegacyCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(code);
}

function validStudentNumber(value, format) {
  return typeof value === "string" && value.length > 0 &&
    value.length <= format.maxLength && value === value.trim() &&
    new RegExp("^(?:" + format.pattern + ")$").test(value);
}

function identityLabel(data) {
  return data.studentNumber !== undefined ? "학번 " + data.studentNumber : "기존 식별코드 " + data.studentCode;
}

function researchExport(data) {
  const { studentNumber, studentCode, evaluatedAt, records, type, ...content } = data;
  const identity = studentNumber ?? studentCode;
  const research = { ...content, type: type + "-research" };
  if (records) research.records = records.map(({ answers }) => ({ answers }));
  return JSON.parse(JSON.stringify(research, (key, value) => {
    if (identity && typeof value === "string" && (
      Object.hasOwn(stages[0].fields, key) || Object.hasOwn(stages[1].fields, key) ||
      Object.hasOwn(stages[2].fields, key) || Object.hasOwn(stages[3].fields, key) ||
      ["note", "feedback", "strengths", "improvements", "nextSteps"].includes(key)
    )) return value.replaceAll(identity, "[식별 정보 삭제]");
    return value;
  }));
}

function studentDownloads(card, partial) {
  add(card, "p", personalFileNotice);
  add(card, "p", researchFileNotice);
  const actions = add(card, "div", undefined, { class: "actions" });
  const stem = "think-before-ai-submission" + (partial ? "-partial" : "");
  add(actions, "button", partial ? "현재까지 제출한 기록 JSON 다운로드" : "학생 기록 JSON 다운로드", { type: "button" }).onclick = () => {
    download(submission(), stem + ".json");
  };
  add(actions, "button", "연구·발표용 JSON 다운로드", { type: "button", class: "secondary" }).onclick = () => {
    download(researchExport(submission()), stem + "-research.json");
  };
}

function validAnswer(answer) {
  return typeof answer === "string" && answer.length <= maxText && answer.trim().length > 0;
}

function download(data, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([type === "application/json" ? JSON.stringify(data, null, 2) : data], { type }));
  const link = add(document.body, "a", undefined, { href: url, download: filename });
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function submission() {
  const { problem, studentNumber, records } = session;
  return { type: "think-before-ai-submission", schemaVersion: submissionVersion, assignmentId: problem.id,
    assignmentVersion: problem.version, problem, studentNumber, records };
}

function renderStudent(focus = false) {
  const problem = session.problem;
  const index = session.records.length;
  const process = ["문제 확인", "사전 사고", "힌트 공개", "사고 수정", "모범 답변 비교", "독립 수행", "기록 내보내기"];
  const step = !session.started ? 0 : index === 0 ? 1 : index === 1 ? (session.writingRevision ? 3 : 2) : index + 2;
  $("meter").value = step + Number(step === 6);
  $("progress-label").textContent = step === 6 ? "7 / 7 단계 완료" : (step + 1) + " / 7 단계";
  $("steps").replaceChildren();
  process.forEach((name, i) => {
    const state = i < step || step === 6 ? "완료" : i === step ? "진행 중" : "대기";
    add($("steps"), "li", name + " · " + state, i === step && step < 6 ? { "aria-current": "step" } : {});
  });

  const activity = $("activity");
  activity.replaceChildren();
  const card = add(activity, "article", undefined, { class: "card" });
  const heading = add(card, "h2", process[step], { tabindex: "-1" });

  if (step <= 4) {
    callout(card, problem.title + " · v" + problem.version, problem.problem);
    add(card, "p", problem.subject);
    callout(card, "학습목표", problem.objectives);
  }

  if (step === 0) {
    renderStudentStart(card, problem);
  } else if (step === 2) {
    for (let i = 0; i < session.hintsSeen; i++) callout(card, "힌트 " + (i + 1), problem.hints[i]);
    const done = session.hintsSeen === problem.hints.length;
    add(card, "p", session.hintsSeen + " / " + problem.hints.length + "개 힌트 확인");
    add(card, "button", done ? "사고 수정 기록 작성" : "힌트 " + (session.hintsSeen + 1) + " 공개").onclick = () => {
      if (done) session.writingRevision = true;
      else session.hintsSeen++;
      saveStudent();
      renderStudent(true);
    };
  } else if (step === 6) {
    add(card, "p", "학습 기록 제출을 완료했습니다. 파일을 내려받아 담당 교수자에게 전달하세요.");
    studentDownloads(card, false);
    recordDetails(add(activity, "section", undefined, { class: "card" }), session.records);
  } else {
    if (step === 1) callout(card, "사전 사고 입력 안내", problem.guidance);
    if (step === 3) {
      problem.hints.forEach((hint, i) => callout(card, "힌트 " + (i + 1), hint));
      add(card, "p", "타당한 근거가 있다면 최초 판단을 유지할 수 있습니다.");
    }
    if (step === 4) callout(card, "모범 답변", problem.model);
    if (step === 5) {
      callout(card, problem.independentTitle, problem.independent);
      add(card, "p", "이 단계에서는 힌트와 모범 답변을 제공하지 않습니다. 외부 AI 사용을 기술적으로 완전히 차단할 수 없습니다. 자신의 판단과 근거를 직접 작성하세요.");
    }
    renderStudentForm(card, index);
    if (step === 3 || step === 4) {
      const prior = add(activity, "section", undefined, { class: "card" });
      add(prior, "h2", "제출한 내 기록");
      recordDetails(prior, session.records);
    }
  }
  if (index > 0 && step < 6) studentDownloads(card, true);
  if (focus) heading.focus();
}

function renderStudentStart(card, problem) {
  const form = add(card, "form");
  form.noValidate = true;
  const number = field(form, "studentNumber", "학번 (필수)", {
    type: "text", required: "", maxlength: problem.studentNumber.maxLength, autocomplete: "off",
    inputmode: problem.studentNumber.inputMode, "aria-describedby": "number-help"
  }, "input");
  add(form, "p", problem.studentNumber.help + " 학번은 학습·평가 기록에 연결됩니다. 이름과 연락처는 입력하지 마세요.", { id: "number-help" });
  number.value = session.draft.studentNumber ?? "";
  const error = add(form, "p", "", { class: "error", role: "alert", id: "student-error" });
  number.oninput = () => {
    session.draft = { studentNumber: number.value };
    number.removeAttribute("aria-invalid");
    number.setAttribute("aria-describedby", "number-help");
    error.textContent = "";
    saveStudent();
  };
  add(form, "button", "학습 시작 · 사전 사고 작성", { type: "submit" });
  form.onsubmit = event => {
    event.preventDefault();
    const value = number.value.trim();
    if (!validStudentNumber(value, problem.studentNumber)) {
      error.textContent = "학번을 확인해 주세요. " + problem.studentNumber.help;
      number.setAttribute("aria-invalid", "true");
      number.setAttribute("aria-describedby", "number-help student-error");
      number.focus();
      return;
    }
    session.studentNumber = value;
    session.draft = {};
    session.started = true;
    saveStudent();
    renderStudent(true);
  };
}

function renderStudentForm(card, index) {
  const form = add(card, "form");
  form.noValidate = true;
  const entries = Object.entries(stages[index].fields);
  for (const [key, label] of entries) field(form, key, label, { required: "" });
  const inputs = [...form.querySelectorAll("input, textarea")];
  for (const input of inputs) input.value = session.draft[input.name] ?? "";
  form.oninput = () => {
    session.draft = Object.fromEntries(inputs.map(input => [input.name, input.value]));
    saveStudent();
  };
  add(form, "p", "모든 입력란이 필수입니다. 제출한 기록은 이후 단계에서 수정할 수 없습니다.");
  const error = add(form, "p", "", { class: "error", role: "alert", id: "student-error" });
  add(form, "button", stages[index].button, { type: "submit" });
  form.onsubmit = event => {
    event.preventDefault();
    if (session.records.length !== index) return;
    const answers = Object.fromEntries(entries.map(([key]) => [key, form.elements[key].value]));
    const missing = entries.find(([key]) => !validAnswer(answers[key]));
    if (missing) {
      const input = form.elements[missing[0]];
      error.textContent = missing[1] + " (내용을 입력해 주세요.)";
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "student-error");
      input.oninput = () => {
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
        error.textContent = "";
        input.oninput = null;
      };
      input.focus();
      return;
    }
    session.records.push(Object.freeze({ submittedAt: new Date().toISOString(), answers: Object.freeze(answers) }));
    session.draft = {};
    saveStudent();
    renderStudent(true);
  };
}


function exactObject(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validDate(value) {
  if (typeof value !== "string" || value.length !== 24) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validateSubmission(data) {
  const version = data?.schemaVersion;
  const legacy = version === 1;
  const snapshot = version === submissionVersion;
  const identityKey = legacy ? "studentCode" : "studentNumber";
  const keys = ["type", "schemaVersion", "assignmentId", identityKey, "records"];
  if (snapshot) keys.push("assignmentVersion", "problem");
  if (![1, 2, submissionVersion].includes(version) || !exactObject(data, keys) ||
      data.type !== "think-before-ai-submission" || typeof data.assignmentId !== "string" ||
      !Array.isArray(data.records) || data.records.length < 1 || data.records.length > stages.length) {
    throw new Error("지원하는 학생 제출 JSON 형식이 아닙니다.");
  }
  if (snapshot) {
    validateProblem(data.problem);
    if (data.assignmentId !== data.problem.id || data.assignmentVersion !== data.problem.version) {
      throw new Error("제출 기록의 문제 ID 또는 버전이 스냅샷과 일치하지 않습니다.");
    }
  } else if (data.assignmentId !== assignment.id) {
    throw new Error("이전 형식의 제출은 기본 예시 과제만 지원합니다.");
  }
  if (!(legacy ? validLegacyCode(data.studentCode) : validStudentNumber(data.studentNumber, snapshot ? data.problem.studentNumber : assignment.studentNumber))) {
    throw new Error("제출 기록의 학번 형식이 올바르지 않습니다.");
  }
  data.records.forEach((record, index) => {
    const keys = Object.keys(stages[index].fields);
    if (!exactObject(record, ["submittedAt", "answers"]) || !validDate(record.submittedAt) ||
        !exactObject(record.answers, keys) || !keys.every(key => validAnswer(record.answers[key]))) {
      throw new Error((index + 1) + "단계 기록의 내용 또는 구조가 올바르지 않습니다.");
    }
  });
}

function scoreText(score) {
  return score.toFixed(2);
}

function csvCell(value) {
  let text = String(value ?? "");
  // Keep spreadsheet software from treating free-text notes as formulas.
  if (typeof value === "string" && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function evaluationCsv(result) {
  const rows = [[
    "과제 ID", "버전", "학번", "기존 식별코드", "평가 시각", "영역", "배점", "상태", "수준", "점수",
    "기술문", "평가 근거 메모", "평가한 영역 합계", "최종 총점", "강점", "보완", "추가 학습", "종합 피드백"
  ]];
  for (const criterion of result.criteria) {
    rows.push([
      result.assignmentId, result.assignmentVersion, result.studentNumber, result.studentCode, result.evaluatedAt, criterion.id + ". " + criterion.name,
      criterion.max, statusLabels[criterion.status], criterion.level,
      criterion.score === null ? "" : scoreText(criterion.score), criterion.description, criterion.note,
      scoreText(result.subtotal), result.total === null ? "" : scoreText(result.total), result.strengths, result.improvements, result.nextSteps, result.feedback
    ]);
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function renderAssessment(data, root) {
  const problem = data.problem ?? defaultProblem;
  const areaRubric = problem.rubric.map((area, index) => ({ ...area, evidence: rubric[index].evidence }));
  const storageId = JSON.stringify([data.assignmentId, data.assignmentVersion ?? "legacy", data.studentNumber ?? data.studentCode,
    ...data.records.map(record => record.submittedAt)]);
  const saved = readLocal(evaluationKey, {})[storageId];
  const overview = add(root, "section", undefined, { class: "card no-print" });
  add(overview, "h2", problem.title + " · " + problem.id + " v" + problem.version + " · " + identityLabel(data));
  const all = add(overview, "details");
  add(all, "summary", "전체 문제와 제출 기록");
  callout(all, "최초 문제", problem.problem);
  callout(all, "학습목표", problem.objectives);
  problem.hints.forEach((hint, i) => callout(all, "힌트 " + (i + 1), hint));
  callout(all, "모범 답변", problem.model);
  callout(all, "독립 수행 문제 (힌트 미제공)", problem.independent);
  recordDetails(all, data.records);
  const researchRecords = add(overview, "button", "연구·발표용 학생 기록 JSON 다운로드", { type: "button", class: "secondary" });
  researchRecords.onclick = () => download(researchExport(data), "think-before-ai-submission-research.json");

  const form = add(root, "form", undefined, { class: "card no-print" });
  add(form, "h2", "4수준 분석적 루브릭");
  add(form, "p", "영역 점수는 배점 × 선택 수준 ÷ 4입니다. 교수자가 원문을 읽고 수준을 정합니다. 글자 수, 입력 시간, 특정 키워드나 AI 활용량으로 자동 평가하지 않습니다.");
  add(form, "p", "이 평가 영역과 배점은 프로젝트용 초안이며 타당화된 척도가 아닙니다.");
  const guide = add(form, "ul", undefined, { class: "status-guide" });
  add(guide, "li", "미제출 — 연결된 학생 기록 중 일부 또는 전부가 없어 채점을 보류합니다.");
  add(guide, "li", "평가 불가 — 기록은 있으나 판단에 쓸 수 없는 경우 교수자가 선택하고 메모에 이유를 남길 수 있습니다.");
  add(guide, "li", "미평가 — 채점에 필요한 기록이 있으나 교수자가 아직 수준을 선택하지 않았습니다.");
  add(form, "p", "세 상태는 점수 합계에서 제외합니다. 네 영역의 수준을 모두 선택하면 최종 총점이 확정됩니다. 미완료 상태도 평가 기록으로 내보낼 수 있습니다.");

  const controls = areaRubric.map(criterion => {
    const group = add(form, "fieldset", undefined, { class: "criterion" });
    add(group, "legend", criterion.id + ". " + criterion.name + " (" + criterion.max + "점)");
    const pair = add(group, "div", undefined, { class: "evidence-layout" });
    const scale = add(pair, "section");
    add(scale, "h3", "수준별 기술문");
    const list = add(scale, "ol", undefined, { class: "rubric", reversed: "", start: "4" });
    for (const description of criterion.levels.slice().reverse()) add(list, "li", description);

    const source = add(pair, "section", undefined, { class: "criterion-evidence" });
    add(source, "h3", "관련 학생 기록");
    const missing = criterion.evidence.some(([stage]) => !data.records[stage]);
    for (const [stage, key, label] of criterion.evidence) {
      const record = data.records[stage];
      const detail = add(source, "details");
      detail.open = true;
      add(detail, "summary", label + (record ? "" : " · 미제출"));
      if (record) {
        add(detail, "p", formatDate(record.submittedAt), { class: "evidence-time" });
        add(detail, "p", record.answers[key], { class: "record" });
      }
    }
    if (criterion.id === "D") {
      callout(source, "독립 수행 문제", problem.independent);
      callout(source, "독립 수행 채점 기준", problem.independentCriteria);
    }

    const grading = add(group, "div", undefined, { class: "grading-layout" });
    const selection = add(grading, "div");
    const scoreId = "score-" + criterion.id;
    const select = field(selection, "level-" + criterion.id, criterion.name + " 평가 수준", {
      "aria-describedby": scoreId
    }, "select");
    const defaultStatus = missing ? "missing" : "pending";
    add(select, "option", statusLabels[defaultStatus], { value: defaultStatus });
    if (missing) {
      select.disabled = true;
    } else {
      add(select, "option", statusLabels.unavailable, { value: "unavailable" });
      criterion.levels.forEach((_, i) => add(select, "option", "수준 " + (i + 1) + " · " + scoreText(criterion.max * (i + 1) / 4) + "점", { value: i + 1 }));
    }
    const score = add(selection, "p", "", { id: scoreId, class: "criterion-score" });
    const note = field(add(grading, "div"), "note-" + criterion.id, criterion.name + " 평가 근거 메모");
    const prior = saved?.criteria?.[criterion.id];
    if (prior) {
      if ([...select.options].some(option => option.value === prior.level)) select.value = prior.level;
      note.value = prior.note ?? "";
    }
    return { select, score, note };
  });

  const total = add(form, "p", "", { class: "assessment-total", role: "status" });
  add(form, "h3", "교수자 피드백");
  const feedbackFields = [
    ["strengths", "학생의 강점"], ["improvements", "보완이 필요한 부분"],
    ["nextSteps", "추가 학습 제안"], ["feedback", "종합 평가 의견"]
  ].map(([id, label]) => field(form, id, label));
  for (const input of feedbackFields) input.value = saved?.feedback?.[input.id] ?? "";
  const storageStatus = add(form, "p", saved ? "저장된 평가를 불러왔습니다." : "", { role: "status" });
  add(form, "p", personalFileNotice);
  add(form, "p", researchFileNotice);
  const actions = add(form, "div", undefined, { class: "actions" });
  const json = add(actions, "button", "평가 결과 JSON 다운로드", { type: "button" });
  const research = add(actions, "button", "연구·발표용 JSON 다운로드", { type: "button", class: "secondary" });
  const csv = add(actions, "button", "평가 결과 CSV 다운로드", { type: "button" });
  const print = add(actions, "button", "인쇄용 화면 열기", { type: "button" });

  function evaluate() {
    const criteria = areaRubric.map(({ id, name, max, levels }, index) => {
      const { select, note } = controls[index];
      const level = Number(select.value) || null;
      return {
        id, name, max, status: level === null ? select.value : "scored", level,
        description: level === null ? "" : levels[level - 1],
        score: level === null ? null : max * level / 4, note: note.value
      };
    });
    const subtotal = criteria.reduce((sum, criterion) => sum + (criterion.score ?? 0), 0);
    const finalized = criteria.every(criterion => criterion.status === "scored");
    return {
      type: "think-before-ai-evaluation", schemaVersion: 4, assignmentId: data.assignmentId,
      assignmentVersion: data.assignmentVersion ?? null, assignmentTitle: problem.title,
      ...(data.studentNumber === undefined ? { studentCode: data.studentCode } : { studentNumber: data.studentNumber }), evaluatedAt: new Date().toISOString(),
      criteria, subtotal, finalized, total: finalized ? subtotal : null,
      ...Object.fromEntries(feedbackFields.map(input => [input.id, input.value]))
    };
  }
  function updateScore() {
    const result = evaluate();
    result.criteria.forEach(({ status, score, max }, index) => {
      controls[index].score.textContent = score === null
        ? statusLabels[status] + " · 점수 없음"
        : "영역 점수 " + scoreText(score) + " / " + scoreText(max) + "점";
    });
    const scored = result.criteria.filter(criterion => criterion.status === "scored").length;
    total.textContent = result.finalized
      ? "최종 총점 " + scoreText(result.total) + " / 100.00점"
      : scored + " / 4개 영역 평가 완료 · 평가한 영역 합계 " + scoreText(result.subtotal) + "점 · 최종 총점 미확정";
  }
  const filename = "think-before-ai-evaluation";
  form.onsubmit = event => event.preventDefault();
  function saveAssessment() {
    const previous = readLocal(evaluationKey, {});
    previous[storageId] = {
      criteria: Object.fromEntries(areaRubric.map((area, index) => [area.id, {
        level: controls[index].select.value, note: controls[index].note.value
      }])),
      feedback: Object.fromEntries(feedbackFields.map(input => [input.id, input.value]))
    };
    storageStatus.textContent = writeLocal(evaluationKey, previous)
      ? "평가를 이 브라우저에 저장했습니다." : "로컬 저장에 실패했습니다. 평가 JSON을 내려받으세요.";
  }
  form.oninput = saveAssessment;
  form.onchange = () => { updateScore(); saveAssessment(); };
  json.onclick = () => download(evaluate(), filename + ".json");
  research.onclick = () => download(researchExport(evaluate()), filename + "-research.json");
  csv.onclick = () => download(evaluationCsv(evaluate()), filename + ".csv", "text/csv;charset=utf-8");
  print.onclick = () => showPrint(evaluate(), print);
  updateScore();
}

function showPrint(result, trigger) {
  const report = add(document.body, "section", undefined, { id: "print-report", class: "wrap card", role: "dialog", "aria-modal": "true", "aria-labelledby": "print-title" });
  add(report, "h1", "Think Before AI · 평가 결과", { id: "print-title" });
  add(report, "p", result.assignmentTitle + (result.assignmentVersion ? " · v" + result.assignmentVersion : "") + " · " + identityLabel(result) + " · " + formatDate(result.evaluatedAt));
  add(report, "p", personalFileNotice);
  add(report, "h2", result.finalized
    ? "최종 총점 " + scoreText(result.total) + " / 100.00점"
    : "최종 총점 미확정 · 평가한 영역 합계 " + scoreText(result.subtotal) + "점");
  for (const criterion of result.criteria) {
    const score = criterion.score === null
      ? statusLabels[criterion.status] + " · 점수 없음"
      : "수준 " + criterion.level + " · " + scoreText(criterion.score) + " / " + scoreText(criterion.max) + "점";
    add(report, "h3", criterion.id + ". " + criterion.name + " · " + score);
    if (criterion.description) add(report, "p", criterion.description);
    add(report, "p", "평가 근거 메모");
    add(report, "p", criterion.note || "작성된 메모가 없습니다.", { class: "record" });
  }
  add(report, "h2", "교수자 피드백");
  for (const [label, value] of [
    ["학생의 강점", result.strengths], ["보완이 필요한 부분", result.improvements],
    ["추가 학습 제안", result.nextSteps], ["종합 평가 의견", result.feedback]
  ]) {
    add(report, "h3", label);
    add(report, "p", value || "작성된 내용이 없습니다.", { class: "record" });
  }
  const actions = add(report, "div", undefined, { class: "actions no-print" });
  const print = add(actions, "button", "인쇄");
  const close = add(actions, "button", "평가 화면으로 돌아가기");
  const background = Array.from(document.body.children).filter(node => node !== report);
  document.body.classList.add("printing");
  background.forEach(node => { node.hidden = true; });
  print.onclick = () => window.print();
  close.onclick = () => {
    report.remove();
    background.forEach(node => { node.hidden = false; });
    document.body.classList.remove("printing");
    trigger.focus();
  };
  report.onkeydown = event => {
    if (event.key === "Escape") close.click();
    if (event.key === "Tab" && ((!event.shiftKey && document.activeElement === close) ||
        (event.shiftKey && document.activeElement === print))) {
      event.preventDefault();
      (event.shiftKey ? close : print).focus();
    }
  };
  print.focus();
}

function renderImportList() {
  const query = $("student-search").value.trim().toLowerCase();
  const picker = $("student-record");
  picker.replaceChildren();
  add(picker, "option", "기록 선택", { value: "" });
  let matches = 0;
  for (const [id, { data }] of imported) {
    const identity = data.studentNumber ?? data.studentCode;
    if (!identity.toLowerCase().includes(query)) continue;
    matches++;
    const last = data.records.at(-1);
    add(picker, "option", "#" + id + " · " + identityLabel(data) + " · " + data.assignmentId + (data.assignmentVersion ? " v" + data.assignmentVersion : "") + " · " + data.records.length + "/4단계 · " + formatDate(last.submittedAt), { value: id });
  }
  picker.value = [...picker.options].some(option => option.value === selectedImport) ? selectedImport : "";
  $("search-status").textContent = matches + " / " + imported.size + "개 기록";
  const active = imported.get(picker.value)?.panel;
  if ($("assessment").firstElementChild !== active) $("assessment").replaceChildren(...(active ? [active] : []));
}

function selectImport(id) {
  selectedImport = id;
  const entry = imported.get(id);
  if (entry && !entry.panel) {
    entry.panel = document.createElement("div");
    renderAssessment(entry.data, entry.panel);
  }
  renderImportList();
}

function initTeacherAssessment() {
  $("student-search").oninput = renderImportList;
  $("student-record").onchange = event => selectImport(event.target.value);

  $("upload").onchange = async event => {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    const attempt = ++importAttempt;
    const status = $("import-status");
    status.classList.remove("error");
    status.textContent = "파일을 확인하는 중입니다.";
    event.target.value = "";
    const errors = [];
    const newEntries = new Map();
    let duplicates = 0;
    let lastId = "";
    for (const [index, file] of files.entries()) {
      try {
        if (file.size === 0 || file.size > maxFile) throw new Error("비어 있거나 1 MiB를 초과한 파일입니다.");
        const contents = await file.text();
        if (attempt !== importAttempt) return;
        let data;
        try { data = JSON.parse(contents.replace(/^\uFEFF/, "")); }
        catch { throw new Error("JSON 문법을 읽을 수 없습니다."); }
        validateSubmission(data);
        const signature = JSON.stringify(data);
        if (newEntries.has(signature) || [...imported.values()].some(entry => entry.signature === signature)) {
          duplicates++;
          continue;
        }
        newEntries.set(signature, data);
      } catch (error) {
        if (attempt !== importAttempt) return;
        errors.push((index + 1) + "번째 파일: " + error.message);
      }
    }
    for (const [signature, data] of newEntries) {
      lastId = String(imported.size + 1);
      imported.set(lastId, { data, signature });
    }
    const added = newEntries.size;
    $("record-browser").hidden = imported.size === 0;
    if (added) {
      $("student-search").value = "";
      selectImport(lastId);
    }
    const report = added + "개 기록을 불러왔습니다. 중복 " + duplicates + "개.";
    status.classList.toggle("error", errors.length > 0);
    status.textContent = errors.length ? report + " 평가 불가 — " + errors.join(" ") : report;
  };
}
