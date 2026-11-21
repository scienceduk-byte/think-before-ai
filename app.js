"use strict";

const stages = [
  { name: "최초 사고", button: "최초 사고 제출 및 힌트 보기", fields: {
    thought: "최초 생각 · 어떤 결정을 권고하나요?",
    evidence: "판단 근거 · 어떤 자료나 가정에 근거했나요?",
    strategy: "해결 전략 · 무엇을 어떻게 확인하겠나요?"
  }},
  { name: "힌트 후 수정", button: "수정 기록 제출 및 모범 답변 보기", fields: {
    revision: "수정한 생각 · 힌트 검토 후 결론이나 접근을 다시 작성하세요.",
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
  { name: "사전 사고의 논리성", max: 20, levels: [
    "권고가 불분명하거나 근거와 검증 전략을 제시하지 않는다.",
    "권고와 관찰 자료를 언급하나 둘의 연결이 약하고 검증 전략이 막연하다.",
    "관찰 자료를 권고에 연결하고, 판단에 영향을 줄 조건과 실행 가능한 검증 방법을 제시한다.",
    "관찰 결과와 가정을 구분하고 대안적 설명을 검토하며, 어떤 비교 결과에서 권고를 바꿀지 밝힌다."
  ]},
  { name: "사고 수정과 재구성", max: 25, levels: [
    "최초 판단을 반복하거나 변경·유지의 이유를 설명하지 않는다.",
    "힌트의 내용을 언급하지만 자신의 논리나 검증 전략에 어떻게 적용했는지 설명이 부족하다.",
    "힌트와 최초 기록을 연결해 결론이나 전략을 수정 또는 유지한 이유를 구체적으로 설명한다.",
    "최초 추론에서 취약했던 가정을 짚고 대안적 설명을 반영해 권고와 검증 계획을 일관되게 재구성한다."
  ]},
  { name: "비판적 검토", max: 15, levels: [
    "모범 답변을 옮겨 쓰거나 막연한 인상만 제시한다.",
    "구체적인 공통점 또는 차이점을 찾지만 판단에 미치는 영향을 설명하지 않는다.",
    "공통점과 차이점을 구체적으로 비교하고 접근법의 차이가 판단에 미치는 영향을 설명한다.",
    "두 답변의 가정과 한계를 근거로 검토하고, 상황에 맞는 개선이나 추가 증거를 제안한다."
  ]},
  { name: "독립적 문제해결", max: 40, levels: [
    "권고나 검증 계획이 없거나 문제에 주어진 사실을 잘못 해석한다.",
    "권고를 제시하지만 추가 개방의 영향을 다루지 않거나 그 영향을 구분할 비교 방법이 없다.",
    "예약제와 추가 개방의 영향을 구분할 비교 설계와 측정 지표를 제시하고 판단 조건을 설명한다.",
    "현실적인 비교 설계로 두 영향을 구분하고 다른 변동 요인과 운영상 제약을 고려해 유지·변경 조건을 제시한다."
  ]}
];

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

function download(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
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
      !Array.isArray(data.records) || data.records.length !== stages.length) {
    throw new Error("학생 제출 파일 형식이 올바르지 않습니다. 학습 완료 화면에서 받은 JSON 파일을 선택하세요.");
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

function renderAssessment(data) {
  const root = $("assessment");
  const evidence = add(root, "section", undefined, { class: "card" });
  add(evidence, "h2", assignment.title + " · 학생 " + data.studentCode);
  callout(evidence, "최초 문제", assignment.problem);
  callout(evidence, "독립 수행 문제", assignment.independent);
  recordDetails(evidence, data.records);

  const form = add(root, "form", undefined, { class: "card no-print" });
  add(form, "h2", "4수준 루브릭");
  add(form, "p", "수준 1~4는 배점의 25%, 50%, 75%, 100%에 해당합니다. 글자 수나 AI 활용량만으로 점수를 산정하지 않습니다. 최종 평가는 교수자가 결정합니다.");
  const selectors = rubric.map((criterion, index) => {
    const group = add(form, "fieldset");
    add(group, "legend", criterion.name + " (" + criterion.max + "점)");
    const list = add(group, "ol", undefined, { class: "rubric" });
    criterion.levels.forEach((description, i) => add(list, "li", "수준 " + (i + 1) + " · " + description));
    const select = field(group, "level-" + index, criterion.name + " 수준", {}, "select");
    add(select, "option", "수준 선택", { value: "" });
    criterion.levels.forEach((_, i) => add(select, "option", "수준 " + (i + 1) + " · " + criterion.max * (i + 1) / 4 + "점", { value: i + 1 }));
    return select;
  });
  const total = add(form, "p", "", { role: "status" });
  const feedback = field(form, "feedback", "교수자 피드백 (선택)");
  const actions = add(form, "div", undefined, { class: "actions" });
  const json = add(actions, "button", "평가 결과 JSON 다운로드", { type: "button" });
  const print = add(actions, "button", "인쇄용 화면 열기", { type: "button" });

  function evaluate() {
    const criteria = rubric.map(({ name, max, levels }, index) => {
      const level = Number(selectors[index].value);
      return { name, max, level, description: levels[level - 1] ?? "", score: max * level / 4 };
    });
    return {
      type: "think-before-ai-evaluation", schemaVersion, assignmentId: data.assignmentId,
      studentCode: data.studentCode, evaluatedAt: new Date().toISOString(),
      criteria, total: criteria.reduce((sum, criterion) => sum + criterion.score, 0), feedback: feedback.value
    };
  }
  function updateScore() {
    const result = evaluate();
    const selected = result.criteria.filter(criterion => criterion.level > 0).length;
    total.textContent = selected === rubric.length ? "총점 " + result.total + " / 100점" :
      selected + " / " + rubric.length + "개 기준 선택 · 선택한 기준 합계 " + result.total + "점";
    json.disabled = print.disabled = selected !== rubric.length;
  }
  form.onsubmit = event => event.preventDefault();
  form.onchange = updateScore;
  json.onclick = () => download(evaluate(), "think-before-ai-evaluation-" + data.studentCode + ".json");
  print.onclick = () => showPrint(evaluate(), print);
  updateScore();
}

function showPrint(result, trigger) {
  const report = add(document.body, "section", undefined, { id: "print-report", class: "wrap card", role: "dialog", "aria-modal": "true", "aria-labelledby": "print-title" });
  add(report, "h1", "Think Before AI · 평가 결과", { id: "print-title" });
  add(report, "p", assignment.title + " · 학생 " + result.studentCode + " · " + formatDate(result.evaluatedAt));
  add(report, "h2", "총점 " + result.total + " / 100점");
  for (const criterion of result.criteria) {
    add(report, "h3", criterion.name + " · 수준 " + criterion.level + " · " + criterion.score + " / " + criterion.max + "점");
    add(report, "p", criterion.description);
  }
  add(report, "h2", "교수자 피드백");
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
    status.textContent = "학생 " + data.studentCode + "의 4단계 기록을 불러왔습니다.";
    status.classList.remove("error");
  } catch (error) {
    if (attempt !== importAttempt) return;
    status.classList.add("error");
    status.textContent = error.message;
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

