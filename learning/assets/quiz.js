// Reusable quiz components. Include with <script src="../assets/quiz.js" defer></script>.
//
// Multiple choice:
//   <div class="mcq">
//     <p class="q">Question</p>
//     <div class="options">
//       <button data-correct data-why="Why this is right">Option</button>
//       <button data-why="Why this is wrong">Option</button>
//     </div>
//     <div class="feedback"></div>
//   </div>
//   Options are shuffled on load. Keep every option the same word count.
//
// Fill in the blanks:
//   <div class="blanks">
//     <pre>... <input data-answer="import" size="6"> ...</pre>
//     <button class="btn check">Check</button> <button class="btn ghost reveal">Show answers</button>
//     <div class="feedback"></div>
//   </div>
//   data-answer accepts alternatives separated by "|". Comparison ignores surrounding spaces.
//
// Recall prompts use native <details class="recall"> and need no script.

(function () {
  function shuffle(nodes) {
    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    }
    return nodes;
  }

  const mcqs = Array.from(document.querySelectorAll(".mcq"));
  let answered = 0;
  let firstTry = 0;
  const scoreEl = document.querySelector(".score");

  function updateScore() {
    if (!scoreEl) return;
    scoreEl.textContent = `${firstTry} of ${mcqs.length} right on the first try` +
      (answered < mcqs.length ? ` (${mcqs.length - answered} left)` : "");
  }

  mcqs.forEach((q) => {
    const box = q.querySelector(".options");
    const buttons = shuffle(Array.from(box.querySelectorAll("button")));
    buttons.forEach((b) => box.appendChild(b));
    const fb = q.querySelector(".feedback");
    let tries = 0;

    buttons.forEach((b) => {
      b.addEventListener("click", () => {
        tries++;
        const ok = b.hasAttribute("data-correct");
        b.classList.add(ok ? "correct" : "wrong");
        b.disabled = true;
        fb.className = "feedback " + (ok ? "good" : "bad");
        fb.textContent = (ok ? "Right. " : "Not quite. ") + (b.dataset.why || "");
        if (ok) {
          buttons.forEach((x) => (x.disabled = true));
          answered++;
          if (tries === 1) firstTry++;
          updateScore();
        }
      });
    });
  });
  updateScore();

  document.querySelectorAll(".blanks").forEach((block) => {
    const inputs = Array.from(block.querySelectorAll("input[data-answer]"));
    const fb = block.querySelector(".feedback");
    const accepted = (input) => input.dataset.answer.split("|").map((s) => s.trim());

    block.querySelector(".check")?.addEventListener("click", () => {
      let right = 0;
      inputs.forEach((input) => {
        const ok = accepted(input).includes(input.value.trim());
        input.classList.toggle("ok", ok);
        input.classList.toggle("no", !ok);
        if (ok) right++;
      });
      fb.className = "feedback " + (right === inputs.length ? "good" : "bad");
      fb.textContent = right === inputs.length
        ? "All correct."
        : `${right} of ${inputs.length} correct. Red blanks need another look.`;
    });

    block.querySelector(".reveal")?.addEventListener("click", () => {
      inputs.forEach((input) => {
        input.value = accepted(input)[0];
        input.classList.remove("no");
        input.classList.add("ok");
      });
      fb.className = "feedback";
      fb.textContent = "Answers shown. Try again from memory tomorrow.";
    });
  });
})();
