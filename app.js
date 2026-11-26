const QUESTION_COUNT = 5;

const statusElement = document.querySelector("#status");
const questionList = document.querySelector("#question-list");
const newQuestionsButton = document.querySelector("#new-questions");
const progressElement = document.querySelector("#progress");
const celebrationElement = document.querySelector("#celebration");

let allQuestions = [];
let currentQuestions = [];
let remainingQuestions = [];
let currentSetNumber = 0;

function parseQuestions(markdown) {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.trim() !== "");
  if (titleIndex === -1) throw new Error("問題データが空です。");

  const title = lines[titleIndex].trim().replace(/^#+\s*/, "");
  const questions = [];

  for (const [offset, line] of lines.slice(titleIndex + 1).entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*・\s*(.+?)\s+(正|誤)\s*$/);
    if (!match) {
      throw new Error(`${titleIndex + offset + 2}行目の形式を読み取れません。問題文の後に「正」または「誤」を指定してください。`);
    }
    questions.push({ text: match[1].trim(), answer: match[2] });
  }

  if (questions.length < QUESTION_COUNT) {
    throw new Error(`有効な問題が${questions.length}問です。出題には${QUESTION_COUNT}問以上必要です。`);
  }
  return { title, questions };
}

function shuffleQuestions(questions) {
  const shuffled = [...questions];
  // Fisher–Yates shuffle gives each possible ordering equal probability.
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function updateProgress() {
  const answered = currentQuestions.filter((question) => question.answered).length;
  progressElement.textContent = `回答 ${answered} / ${currentQuestions.length} 問`;
  const perfect = answered === QUESTION_COUNT && currentQuestions.every((question) => question.correct);
  if (perfect && celebrationElement.hidden) {
    celebrationElement.hidden = false;
    // Replay the small burst animation whenever a new perfect set is completed.
    celebrationElement.querySelectorAll(".firework, .firework span").forEach((spark) => {
      spark.style.animation = "none";
      void spark.offsetWidth;
      spark.style.animation = "";
    });
  } else if (!perfect) {
    celebrationElement.hidden = true;
  }
}

function renderQuestions() {
  questionList.replaceChildren();
  currentQuestions.forEach((question, index) => {
    const item = document.createElement("li");
    item.className = "question-card";

    const number = document.createElement("span");
    number.className = "question-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = String(index + 1);

    const content = document.createElement("div");
    content.className = "question-content";
    const text = document.createElement("p");
    text.className = "question-text";
    text.textContent = question.text;

    const answerRow = document.createElement("div");
    answerRow.className = "answer-row";
    answerRow.setAttribute("aria-label", `問題${index + 1}の回答`);
    for (const answer of ["正", "誤"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-button";
      button.textContent = answer;
      button.setAttribute("aria-label", `${answer}と回答する`);
      button.disabled = question.answered;
      if (question.answered && question.selectedAnswer === answer) button.classList.add("selected");
      button.addEventListener("click", () => answerQuestion(index, answer));
      answerRow.append(button);
    }

    const result = document.createElement("span");
    result.className = `result${question.answered ? (question.correct ? " correct" : " incorrect") : ""}`;
    result.setAttribute("aria-live", "polite");
    result.textContent = question.answered ? (question.correct ? "正解" : "不正解") : "";
    answerRow.append(result);
    content.append(text, answerRow);
    item.append(number, content);
    questionList.append(item);
  });
  updateProgress();
}

function answerQuestion(index, selectedAnswer) {
  const question = currentQuestions[index];
  if (!question || question.answered) return;
  question.answered = true;
  question.selectedAnswer = selectedAnswer;
  question.correct = selectedAnswer === question.answer;
  renderQuestions();
}

function startNewQuiz() {
  celebrationElement.hidden = true;
  // Start a fresh shuffled deck after the eighth set has been used.
  if (remainingQuestions.length < QUESTION_COUNT) {
    remainingQuestions = shuffleQuestions(allQuestions);
    currentSetNumber = 1;
  } else {
    currentSetNumber = (currentSetNumber % 8) + 1;
  }
  document.querySelector("#set-count").textContent = `セット ${currentSetNumber} / 8`;
  currentQuestions = remainingQuestions.splice(0, QUESTION_COUNT)
    .map((question) => ({ ...question, answered: false, correct: false, selectedAnswer: null }));
  renderQuestions();
}

function initialize() {
  try {
    // The bundled data file allows this page to run directly from file://,
    // where browsers block fetch() access to neighboring local files.
    if (!window.QUIZ_DATA || !Array.isArray(window.QUIZ_DATA.questions)) {
      throw new Error("同じフォルダーに questions-data.js がありません。");
    }
    const { title, questions } = window.QUIZ_DATA;
    if (questions.length < QUESTION_COUNT) {
      throw new Error(`有効な問題が${questions.length}問です。出題には${QUESTION_COUNT}問以上必要です。`);
    }
    allQuestions = questions;
    document.querySelector("#page-title").textContent = title;
    document.title = title;
    statusElement.textContent = "";
    newQuestionsButton.disabled = false;
    startNewQuiz();
  } catch (error) {
    statusElement.classList.add("error");
    statusElement.textContent = `問題を表示できませんでした。${error.message} HTTPサーバー経由でページを開き、mondai.md が同じフォルダーにあることを確認してください。`;
    progressElement.textContent = "";
    newQuestionsButton.disabled = true;
  }
}

newQuestionsButton.addEventListener("click", startNewQuiz);
initialize();
