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
    comparison: "비교와 차이점 · 공통점과 차이점, 모범 답변의 한계 또는 개선점을 적으세요."
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
const schemaVersion = 1;
const session = { studentCode: "", records: [] };
let importAttempt = 0;

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

function validCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(code);
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
  return { type: "think-before-ai-submission", schemaVersion, assignmentId: assignment.id, ...session };
}

function renderStudent(focus = false) {
  const index = session.records.length;
  $("meter").value = index;
  $("progress-label").textContent = index + " / " + stages.length + " 단계 완료";
  $("steps").replaceChildren();
  stages.forEach((stage, i) => {
    const state = i < index ? "완료" : i === index ? "진행 중" : "대기";
    add($("steps"), "li", stage.name + " · " + state, i === index ? { "aria-current": "step" } : {});
  });

  const activity = $("activity");
  activity.replaceChildren();
  const card = add(activity, "article", undefined, { class: "card" });
  const heading = add(card, "h2", stages[index]?.name ?? "학습 기록 제출 완료", { tabindex: "-1" });
  if (index === stages.length) {
    add(card, "p", "JSON 파일을 내려받아 담당 교수자에게 전달하세요.");
    add(card, "button", "학생 기록 JSON 다운로드").onclick = () => {
      download(submission(), "think-before-ai-" + session.studentCode + ".json");
    };
    recordDetails(add(activity, "section", undefined, { class: "card" }), session.records);
  } else {
    if (index < 3) callout(card, assignment.title, assignment.problem);
    if (index === 1) callout(card, "힌트", assignment.hint);
    if (index === 2) callout(card, "모범 답변", assignment.model);
    if (index === 3) {
      callout(card, assignment.independentTitle, assignment.independent);
      add(card, "p", "이 단계에서는 힌트와 모범 답변을 제공하지 않습니다. 외부 AI 사용을 기술적으로 차단할 수 없습니다. 자신의 판단과 근거를 직접 작성하세요.");
    }

    const form = add(card, "form");
    form.noValidate = true;
    if (index === 0) {
      field(form, "studentCode", "임의 식별코드", {
        type: "text", required: "", maxlength: "32", autocomplete: "off", "aria-describedby": "code-help"
      }, "input");
      add(form, "p", "실명 대신 영문, 숫자, 하이픈 또는 밑줄로 된 4~32자의 임의 코드를 사용하세요.", { id: "code-help" });
    }
    const entries = Object.entries(stages[index].fields);
    for (const [key, label] of entries) field(form, key, label, { required: "" });
    add(form, "p", "모든 입력란이 필수입니다. 이 단계의 기록은 제출 후 수정할 수 없습니다.");
    const error = add(form, "p", "", { class: "error", role: "alert", id: "student-error" });
    add(form, "button", stages[index].button, { type: "submit" });
    form.onsubmit = event => {
      event.preventDefault();
      if (session.records.length !== index) return;
      const code = index === 0 ? form.elements.studentCode.value.trim() : session.studentCode;
      const answers = Object.fromEntries(entries.map(([key]) => [key, form.elements[key].value]));
      const invalidCode = !validCode(code);
      const missing = entries.find(([key]) => !validAnswer(answers[key]));
      if (invalidCode || missing) {
        const input = form.elements[invalidCode ? "studentCode" : missing[0]];
        error.textContent = invalidCode ? "식별코드 형식을 확인하세요. 허용된 문자로 4~32자를 입력해 주세요." : missing[1] + " (내용을 입력해 주세요.)";
        input.setAttribute("aria-invalid", "true");
        const description = input.id === "studentCode" ? "code-help" : "";
        input.setAttribute("aria-describedby", [description, "student-error"].filter(Boolean).join(" "));
        input.addEventListener("input", () => {
          input.removeAttribute("aria-invalid");
          if (description) input.setAttribute("aria-describedby", description);
          else input.removeAttribute("aria-describedby");
          error.textContent = "";
        }, { once: true });
        input.focus();
        return;
      }
      session.studentCode = code;
      session.records.push(Object.freeze({ submittedAt: new Date().toISOString(), answers: Object.freeze(answers) }));
      renderStudent(true);
    };
    if (index > 0) {
      add(card, "button", "현재까지 제출한 기록 JSON 다운로드", { type: "button", class: "secondary" }).onclick = () => {
        download(submission(), "think-before-ai-" + session.studentCode + "-partial.json");
      };
    }
    if (index === 1 || index === 2) {
      const prior = add(activity, "section", undefined, { class: "card" });
      add(prior, "h2", "제출한 내 기록");
      recordDetails(prior, session.records);
    }
  }
  if (focus) heading.focus();
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
  if (!exactObject(data, ["type", "schemaVersion", "assignmentId", "studentCode", "records"]) ||
      data.type !== "think-before-ai-submission" || data.schemaVersion !== schemaVersion ||
      !validCode(data.studentCode) || typeof data.assignmentId !== "string" ||
      !Array.isArray(data.records) || data.records.length < 1 || data.records.length > stages.length) {
    throw new Error("학생 제출 파일 형식이 올바르지 않습니다. 학생 화면에서 받은 JSON 파일을 선택하세요.");
  }
  if (data.assignmentId !== assignment.id) throw new Error("현재 학습 과제와 다른 과제의 제출 파일입니다.");
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
    "과제 ID", "학생 코드", "평가 시각", "영역", "배점", "상태", "수준", "점수",
    "기술문", "평가 근거 메모", "평가한 영역 합계", "최종 총점", "종합 피드백"
  ]];
  for (const criterion of result.criteria) {
    rows.push([
      result.assignmentId, result.studentCode, result.evaluatedAt, criterion.id + ". " + criterion.name,
      criterion.max, statusLabels[criterion.status], criterion.level,
      criterion.score === null ? "" : scoreText(criterion.score), criterion.description, criterion.note,
      scoreText(result.subtotal), result.total === null ? "" : scoreText(result.total), result.feedback
    ]);
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function renderAssessment(data) {
  const root = $("assessment");
  const overview = add(root, "section", undefined, { class: "card no-print" });
  add(overview, "h2", assignment.title + " · 학생 " + data.studentCode);
  const all = add(overview, "details");
  add(all, "summary", "전체 문제와 제출 기록");
  callout(all, "최초 문제", assignment.problem);
  callout(all, "힌트", assignment.hint);
  callout(all, "모범 답변", assignment.model);
  callout(all, "독립 수행 문제 (힌트 미제공)", assignment.independent);
  recordDetails(all, data.records);

  const form = add(root, "form", undefined, { class: "card no-print" });
  add(form, "h2", "4수준 분석적 루브릭");
  add(form, "p", "영역 점수는 배점 × 선택 수준 ÷ 4입니다. 교수자가 원문을 읽고 수준을 정합니다. 글자 수, 입력 시간, 특정 키워드나 AI 활용량으로 자동 평가하지 않습니다.");
  add(form, "p", "이 평가 영역과 배점은 프로젝트용 초안이며 타당화된 척도가 아닙니다.");
  const guide = add(form, "ul", undefined, { class: "status-guide" });
  add(guide, "li", "미제출 — 연결된 학생 기록 중 일부 또는 전부가 없어 채점을 보류합니다.");
  add(guide, "li", "평가 불가 — 기록은 있으나 판단에 쓸 수 없는 경우 교수자가 선택하고 메모에 이유를 남길 수 있습니다.");
  add(guide, "li", "미평가 — 채점에 필요한 기록이 있으나 교수자가 아직 수준을 선택하지 않았습니다.");
  add(form, "p", "세 상태는 점수 합계에서 제외합니다. 네 영역의 수준을 모두 선택하면 최종 총점이 확정됩니다. 미완료 상태도 평가 기록으로 내보낼 수 있습니다.");

  const controls = rubric.map(criterion => {
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
    if (criterion.id === "D") callout(source, "독립 수행 문제", assignment.independent);

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
    return { select, score, note };
  });

  const total = add(form, "p", "", { class: "assessment-total", role: "status" });
  const feedback = field(form, "feedback", "종합 피드백 (선택)");
  const actions = add(form, "div", undefined, { class: "actions" });
  const json = add(actions, "button", "평가 결과 JSON 다운로드", { type: "button" });
  const csv = add(actions, "button", "평가 결과 CSV 다운로드", { type: "button" });
  const print = add(actions, "button", "인쇄용 화면 열기", { type: "button" });

  function evaluate() {
    const criteria = rubric.map(({ id, name, max, levels }, index) => {
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
      type: "think-before-ai-evaluation", schemaVersion: 2, assignmentId: data.assignmentId,
      studentCode: data.studentCode, evaluatedAt: new Date().toISOString(),
      criteria, subtotal, finalized, total: finalized ? subtotal : null, feedback: feedback.value
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
  const filename = "think-before-ai-evaluation-" + data.studentCode;
  form.onsubmit = event => event.preventDefault();
  controls.forEach(({ select }) => { select.onchange = updateScore; });
  json.onclick = () => download(evaluate(), filename + ".json");
  csv.onclick = () => download(evaluationCsv(evaluate()), filename + ".csv", "text/csv;charset=utf-8");
  print.onclick = () => showPrint(evaluate(), print);
  updateScore();
}

function showPrint(result, trigger) {
  const report = add(document.body, "section", undefined, { id: "print-report", class: "wrap card", role: "dialog", "aria-modal": "true", "aria-labelledby": "print-title" });
  add(report, "h1", "Think Before AI · 평가 결과", { id: "print-title" });
  add(report, "p", assignment.title + " · 학생 " + result.studentCode + " · " + formatDate(result.evaluatedAt));
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
  add(report, "h2", "종합 피드백");
  add(report, "p", result.feedback || "작성된 피드백이 없습니다.", { class: "record" });
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

$("upload").onchange = async event => {
  const file = event.target.files[0];
  const attempt = ++importAttempt;
  const status = $("import-status");
  $("assessment").replaceChildren();
  status.textContent = "";
  status.classList.remove("error");
  if (!file) return;
  try {
    if (file.size === 0 || file.size > maxFile) throw new Error("비어 있거나 1 MiB를 초과한 파일입니다.");
    status.textContent = "파일을 확인하는 중입니다.";
    const contents = await file.text();
    if (attempt !== importAttempt) return;
    let data;
    try { data = JSON.parse(contents.replace(/^\uFEFF/, "")); }
    catch { throw new Error("JSON 문법을 읽을 수 없습니다. 학생이 내려받은 파일을 확인하세요."); }
    validateSubmission(data);
    renderAssessment(data);
    status.textContent = "학생 " + data.studentCode + "의 기록을 불러왔습니다. 제출된 단계 " + data.records.length + " / 4.";
    status.classList.remove("error");
  } catch (error) {
    if (attempt !== importAttempt) return;
    status.classList.add("error");
    status.textContent = "평가 불가 — " + error.message;
  } finally {
    if (attempt === importAttempt) event.target.value = "";
  }
};

const tabs = [$("student-tab"), $("teacher-tab")];
function selectTab(active) {
  for (const tab of tabs) {
    const selected = tab === active;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !selected;
  }
}
tabs.forEach((tab, index) => {
  tab.onclick = () => selectTab(tab);
  tab.onkeydown = event => {
    const destinations = { ArrowLeft: 1 - index, ArrowRight: 1 - index, Home: 0, End: 1 };
    if (!Object.hasOwn(destinations, event.key)) return;
    event.preventDefault();
    const next = tabs[destinations[event.key]];
    selectTab(next);
    next.focus();
  };
});

renderStudent();

