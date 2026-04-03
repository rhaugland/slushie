(function() {
  // Extract API key from script tag
  var scripts = document.getElementsByTagName("script");
  var currentScript = scripts[scripts.length - 1];
  var src = currentScript.getAttribute("src") || "";
  var keyMatch = src.match(/[?&]key=([^&]+)/);
  if (!keyMatch) return;
  var apiKey = keyMatch[1];
  var baseUrl = src.split("/feedback.js")[0];

  // Create styles
  var style = document.createElement("style");
  style.textContent = [
    ".slushie-fb-bar{position:fixed;top:0;left:0;right:0;z-index:999999;background:#0c1120;border-bottom:1px solid rgba(255,255,255,0.08);padding:8px 16px;display:flex;align-items:center;justify-content:center;gap:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);transition:all 0.2s}",
    ".slushie-fb-bar a{color:rgba(255,255,255,0.8);cursor:pointer;text-decoration:underline;text-underline-offset:2px}",
    ".slushie-fb-bar a:hover{color:#fff}",
    ".slushie-fb-form{position:fixed;top:0;left:0;right:0;z-index:999999;background:#0c1120;border-bottom:1px solid rgba(255,255,255,0.08);padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;transition:all 0.2s}",
    ".slushie-fb-form textarea{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;color:rgba(255,255,255,0.8);font-size:13px;font-family:inherit;resize:none;outline:none;margin-bottom:8px;box-sizing:border-box}",
    ".slushie-fb-form textarea:focus{border-color:rgba(255,255,255,0.2)}",
    ".slushie-fb-form textarea::placeholder{color:rgba(255,255,255,0.2)}",
    ".slushie-fb-btns{display:flex;gap:8px;justify-content:flex-end}",
    ".slushie-fb-submit{background:#ef4444;color:#fff;border:none;padding:6px 16px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit}",
    ".slushie-fb-submit:hover{background:#dc2626}",
    ".slushie-fb-submit:disabled{opacity:0.4;cursor:not-allowed}",
    ".slushie-fb-cancel{background:none;color:rgba(255,255,255,0.3);border:none;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit}",
    ".slushie-fb-cancel:hover{color:rgba(255,255,255,0.5)}",
    ".slushie-fb-thanks{text-align:center;color:rgba(255,255,255,0.6);font-size:13px;padding:4px 0}",
  ].join("");
  document.head.appendChild(style);

  // Create bar
  var bar = document.createElement("div");
  bar.className = "slushie-fb-bar";
  bar.innerHTML = 'What could be better? <a id="slushie-fb-open">Let us know</a>';
  document.body.appendChild(bar);

  // Offset body so content isn't hidden behind bar
  document.body.style.marginTop = (parseInt(getComputedStyle(document.body).marginTop) || 0) + 37 + "px";

  // Create form (hidden initially)
  var form = document.createElement("div");
  form.className = "slushie-fb-form";
  form.style.display = "none";
  form.innerHTML = [
    '<textarea class="slushie-fb-textarea" rows="3" placeholder="Tell us what could be better..."></textarea>',
    '<div class="slushie-fb-btns">',
    '<button class="slushie-fb-cancel">Cancel</button>',
    '<button class="slushie-fb-submit" disabled>Submit</button>',
    '</div>',
  ].join("");
  document.body.appendChild(form);

  var textarea = form.querySelector(".slushie-fb-textarea");
  var submitBtn = form.querySelector(".slushie-fb-submit");
  var cancelBtn = form.querySelector(".slushie-fb-cancel");

  textarea.addEventListener("input", function() {
    submitBtn.disabled = !textarea.value.trim();
  });

  document.getElementById("slushie-fb-open").addEventListener("click", function() {
    bar.style.display = "none";
    form.style.display = "block";
    textarea.focus();
  });

  cancelBtn.addEventListener("click", function() {
    form.style.display = "none";
    bar.style.display = "flex";
    textarea.value = "";
    submitBtn.disabled = true;
  });

  submitBtn.addEventListener("click", function() {
    var text = textarea.value.trim();
    if (!text) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    fetch(baseUrl + "/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey, text: text }),
    }).then(function() {
      form.innerHTML = '<div class="slushie-fb-thanks">Thanks for your feedback!</div>';
      setTimeout(function() {
        form.style.display = "none";
        bar.style.display = "flex";
        form.innerHTML = [
          '<textarea class="slushie-fb-textarea" rows="3" placeholder="Tell us what could be better..."></textarea>',
          '<div class="slushie-fb-btns">',
          '<button class="slushie-fb-cancel">Cancel</button>',
          '<button class="slushie-fb-submit" disabled>Submit</button>',
          '</div>',
        ].join("");
        // Re-bind events after rebuilding form
        textarea = form.querySelector(".slushie-fb-textarea");
        submitBtn = form.querySelector(".slushie-fb-submit");
        cancelBtn = form.querySelector(".slushie-fb-cancel");
        textarea.addEventListener("input", function() {
          submitBtn.disabled = !textarea.value.trim();
        });
        cancelBtn.addEventListener("click", function() {
          form.style.display = "none";
          bar.style.display = "flex";
          textarea.value = "";
          submitBtn.disabled = true;
        });
        submitBtn.addEventListener("click", arguments.callee);
      }, 2000);
    }).catch(function() {
      submitBtn.textContent = "Error — try again";
      submitBtn.disabled = false;
    });
  });
})();
