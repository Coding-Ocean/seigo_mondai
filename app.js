const QUESTION_COUNT = 5;
const ANSWER_CHOICES = ["正", "誤"];

function parseQuestions(markdown) {
  if (typeof markdown !== "string") {
    throw new Error("問題データの形式が文字列ではありません。");
  }

  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.trim() !== "");
  if (titleIndex === -1) {
    throw new Error("問題データが空です。タイトルと問題文を確認してください。");
  }

  const title = lines[titleIndex].trim().replace(/^#+\s*/, "").trim();
  if (!title) {
    throw new Error(`${titleIndex + 1}行目のタイトルが空です。`);
  }

  const questions = [];
  for (let i = titleIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^\s*・\s*(\S.*?)\s+(正|誤)\s*$/);
    if (!match) {
      throw new Error(
        `問題データを読み込めませんでした（${i + 1}行目の形式が正しくありません。「・問題文 正」または「・問題文 誤」の形式で記述してください）。`
      );
    }

    questions.push({
      text: match[1].trim(),
      answer: match[2],
    });
  }

  if (questions.length < QUESTION_COUNT) {
    throw new Error(
      `有効な問題が${questions.length}問しかありません。出題には${QUESTION_COUNT}問以上必要です。`
    );
  }

  return { title, questions };
}

function shuffleQuestions(questions, randomFn = Math.random) {
  const shuffled = [...questions];
  // Fisher–Yates shuffle gives every permutation equal probability.
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createDeckState(questions, questionCount = QUESTION_COUNT, randomFn = Math.random) {
  if (!Array.isArray(questions) || questions.length < questionCount) {
    throw new Error(`有効な問題が${questionCount}問未満のため、出題を開始できません。`);
  }

  const totalSets = Math.floor(questions.length / questionCount);
  let remaining = [];
  let setNumber = 0;

  function drawNextSet() {
    if (remaining.length < questionCount) {
      remaining = shuffleQuestions(questions, randomFn);
      setNumber = 1;
    } else {
      setNumber += 1;
    }

    const selected = remaining.splice(0, questionCount).map((question) => ({
      text: question.text,
      answer: question.answer,
      answered: false,
      selectedAnswer: null,
      correct: false,
    }));

    return {
      setNumber,
      totalSets,
      questions: selected,
    };
  }

  return { drawNextSet };
}

async function loadQuizData() {
  const data = typeof window !== "undefined" ? window.QUIZ_DATA : null;
  if (!data || typeof data !== "object") {
    throw new Error(
      "問題データを読み込めませんでした。同じフォルダーに questions-data.js があるか確認してください。"
    );
  }

  // Support the current generated format: { title, questions: [{ text, answer }] }.
  if (Array.isArray(data.questions)) {
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (!title) {
      throw new Error("questions-data.js にタイトルがありません。");
    }
    const questions = data.questions.map((question, index) => {
      if (
        !question ||
        typeof question.text !== "string" ||
        !question.text.trim() ||
        !ANSWER_CHOICES.includes(question.answer)
      ) {
        throw new Error(`questions-data.js の${index + 1}問目の形式が正しくありません。`);
      }
      return { text: question.text.trim(), answer: question.answer };
    });
    if (questions.length < QUESTION_COUNT) {
      throw new Error(`有効な問題が${questions.length}問しかありません。出題には${QUESTION_COUNT}問以上必要です。`);
    }
    return { title, questions };
  }

  // Backward compatibility for an older generated file containing Markdown.
  if (typeof data.markdown === "string") {
    return parseQuestions(data.markdown);
  }

  throw new Error("questions-data.js の形式が正しくありません。title と questions を確認してください。");
}

function mountQuizApp() {
  const pageTitleElement = document.querySelector("#page-title");
  const setCountElement = document.querySelector("#set-count");
  const statusElement = document.querySelector("#status");
  const questionListElement = document.querySelector("#question-list");
  const celebrationElement = document.querySelector("#celebration");
  const progressElement = document.querySelector("#progress");
  const newQuestionsButton = document.querySelector("#new-questions");

  let deck = null;
  let currentQuestions = [];
  let cardViews = [];

  function setLoadingState() {
    statusElement.className = "status loading";
    statusElement.setAttribute("role", "status");
    statusElement.textContent = "問題を読み込み中です…";
    setCountElement.hidden = true;
    newQuestionsButton.hidden = true;
    newQuestionsButton.disabled = true;
    progressElement.textContent = "";
    celebrationElement.hidden = true;
  }

  function showError(message) {
    statusElement.className = "status error";
    statusElement.setAttribute("role", "alert");
    statusElement.textContent = message;
    questionListElement.replaceChildren();
    setCountElement.hidden = true;
    setCountElement.textContent = "";
    progressElement.textContent = "";
    celebrationElement.hidden = true;
    newQuestionsButton.hidden = true;
    newQuestionsButton.disabled = true;
  }

  function clearStatus() {
    statusElement.className = "status";
    statusElement.setAttribute("role", "status");
    statusElement.textContent = "";
  }

  function replayCelebration() {
    celebrationElement.hidden = false;
    celebrationElement.querySelectorAll(".firework, .firework span").forEach((spark) => {
      spark.style.animation = "none";
      void spark.offsetWidth;
      spark.style.animation = "";
    });
  }

  function updateProgress() {
    const answeredCount = currentQuestions.filter((q) => q.answered).length;
    const correctCount = currentQuestions.filter((q) => q.correct).length;
    const allAnswered =
      currentQuestions.length > 0 && answeredCount === currentQuestions.length;

    if (allAnswered) {
      progressElement.textContent = `回答 ${answeredCount} / ${currentQuestions.length} 問（${correctCount}問正解）`;
    } else {
      progressElement.textContent = `回答 ${answeredCount} / ${currentQuestions.length} 問`;
    }

    newQuestionsButton.hidden = !allAnswered;
    newQuestionsButton.disabled = !allAnswered;

    const isPerfect =
      answeredCount === QUESTION_COUNT &&
      currentQuestions.every((question) => question.correct);
    if (isPerfect && celebrationElement.hidden) {
      replayCelebration();
    } else if (!isPerfect) {
      celebrationElement.hidden = true;
    }
  }

  function answerQuestion(index, selectedAnswer) {
    const question = currentQuestions[index];
    const view = cardViews[index];
    if (!question || !view || question.answered) {
      return;
    }

    question.answered = true;
    question.selectedAnswer = selectedAnswer;
    question.correct = selectedAnswer === question.answer;

    view.buttons.forEach((button) => {
      button.disabled = true;
      const isSelected = button.dataset.choice === selectedAnswer;
      button.setAttribute("aria-pressed", String(isSelected));
      if (isSelected) {
        button.classList.add("selected", question.correct ? "is-correct" : "is-incorrect");
      }
    });

    view.result.className = `result ${question.correct ? "correct" : "incorrect"}`;
    view.result.textContent = question.correct ? "正解" : "不正解";

    updateProgress();
  }

  function renderCurrentSet(setNumber, totalSets) {
    setCountElement.hidden = false;
    setCountElement.textContent = `セット ${setNumber} / ${totalSets}`;
    celebrationElement.hidden = true;

    const fragment = document.createDocumentFragment();
    cardViews = currentQuestions.map((question, index) => {
      const item = document.createElement("li");
      item.className = "question-card";

      const number = document.createElement("span");
      number.className = "question-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1);

      const text = document.createElement("p");
      text.className = "question-text";
      text.textContent = question.text;

      const controls = document.createElement("div");
      controls.className = "answer-controls";

      const buttonsGroup = document.createElement("div");
      buttonsGroup.className = "answer-buttons";
      buttonsGroup.setAttribute("role", "group");
      buttonsGroup.setAttribute("aria-label", `問題${index + 1}の回答`);

      const buttons = ANSWER_CHOICES.map((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "answer-button";
        button.dataset.choice = choice;
        button.textContent = choice;
        button.setAttribute("aria-label", `問題${index + 1}: ${choice}と回答する`);
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => answerQuestion(index, choice));
        buttonsGroup.append(button);
        return button;
      });

      const result = document.createElement("span");
      result.className = "result";
      result.setAttribute("aria-live", "polite");

      controls.append(buttonsGroup, result);
      item.append(number, text, controls);
      fragment.append(item);

      return { item, buttons, result };
    });

    questionListElement.replaceChildren(fragment);
    updateProgress();
  }

  function startNextSet() {
    if (!deck) {
      return;
    }
    const next = deck.drawNextSet();
    currentQuestions = next.questions;
    renderCurrentSet(next.setNumber, next.totalSets);
  }

  async function initialize() {
    setLoadingState();
    try {
      const { title, questions } = await loadQuizData();
      deck = createDeckState(questions, QUESTION_COUNT);
      pageTitleElement.textContent = title;
      document.title = title;
      clearStatus();
      startNextSet();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(message);
    }
  }

  newQuestionsButton.addEventListener("click", startNextSet);
  window.addEventListener("error", (event) => {
    if (!deck) {
      showError(`問題の初期化中にエラーが発生しました: ${event.message}`);
    }
  });

  initialize();
}

if (typeof document !== "undefined") {
  mountQuizApp();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    QUESTION_COUNT,
    parseQuestions,
    shuffleQuestions,
    createDeckState,
  };
}
