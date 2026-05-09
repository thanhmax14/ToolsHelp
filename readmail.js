
/* ── ReadMail App ── */
(function () {
  'use strict';

  /* Fix: Live Server injects its own <script> tag at the bottom which can
     race with inline scripts. Wrapping everything in DOMContentLoaded
     guarantees all elements exist before we query them, regardless of
     whether the page is opened via Live Server or directly in a browser. */
  function init() {
    var API_URL = 'https://readmail.site/Home/Index';

    var credInput    = document.getElementById('outlook-credentials');
    var btnRead      = document.getElementById('read');
    var fileUpload   = document.getElementById('file-upload');
    var counter      = document.getElementById('email-count');
    var inboxSection = document.getElementById('inbox-section');
    var tableResult  = document.getElementById('tableResult');
    var noResults    = document.getElementById('noResults');
    var globalLimit  = document.getElementById('globalMailLimit');
    var emailModal   = document.getElementById('rmEmailModal');
    var emailClose   = document.getElementById('rmEmailModalClose');
    var emailContent = document.getElementById('rmEmailContent');

    if (!credInput || !btnRead) { setTimeout(init, 100); return; }

    var allEmails = [];
    window.rmAccountResults = window.rmAccountResults || {};

    /* ── helpers ── */
    function esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function fmtDate(d) {
      if (!d) return '';
      var dt = new Date(d);
      return dt.toLocaleDateString('en-US') + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    function toast(msg, type) {
      var colors = { error: '#e53e3e', success: '#38a169', info: '#2B6CB0' };
      var t = document.createElement('div');
      t.className = 'rm-toast';
      t.style.background = colors[type] || colors.info;
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
    }

    function safeDecode(v) {
      if (!v) return '';
      try { return decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { return v; }
    }

    /* ── count ── */
    function updateCount() {
      if (!credInput || !counter) return;
      var n = credInput.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).length;
      counter.textContent = n;
    }
    credInput.addEventListener('input', updateCount);

    /* ── parse line ── */
    function parseLine(line) {
      var parts = line.split('|').map(function (x) { return x.trim(); });
      var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      var len = parts.length;
      if (len < 4 || len > 6) return null;
      var email = parts[0], password = parts[1];
      if (!emailRe.test(email) || !password) return null;
      var at = '', rt = '', cid = '', rec = '';
      if (len === 4) { rt = parts[2]; cid = parts[3]; }
      if (len === 5) {
        if (emailRe.test(parts[4])) { rt = parts[2]; cid = parts[3]; rec = parts[4]; }
        else { at = parts[2]; rt = parts[3]; cid = parts[4]; }
      }
      if (len === 6) { at = parts[2]; rt = parts[3]; cid = parts[4]; rec = parts[5]; }
      if (!rt || !cid) return null;
      return { email: email, refresh_token: rt, client_id: cid, access_token: at, recover_email: rec, type: 'oauth' };
    }

    /* ── format error modal ── */
    function showFormatError() {
      var m = document.createElement('div');
      m.className = 'rm-modal-overlay is-open';
    m.innerHTML =
    '<div class="rm-modal-box">'
    + '<div class="rm-modal-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>'
    + '<h3>Invalid Format</h3>'
    + '<p>Please enter credentials in the correct format. Contact admin if you need help.</p>'
    + '<div class="rm-modal-actions">'
    + '<button class="action-btn secondary rm-scope" id="rmFmtClose" style="color:white;">Close</button>'
    + '<button class="action-btn primary rm-scope" id="rmFmtOk" style="color:white;">OK</button>'
    + '</div></div>';
      document.body.appendChild(m);
      function closeMe() { if (m.parentNode) m.parentNode.removeChild(m); }
      m.querySelector('#rmFmtClose').onclick = closeMe;
      m.querySelector('#rmFmtOk').onclick = closeMe;
      m.addEventListener('click', function (e) { if (e.target === m) closeMe(); });
    }

    /* ── skeleton ── */
    function renderSkeleton(accounts) {
      tableResult.innerHTML = accounts.map(function (acc, i) {
        return '<div class="account-result-card" id="rm-acc-' + i + '">'
          + '<div class="account-result-header">'
          + '<div><strong>#' + (i + 1) + '</strong><span>' + esc(acc.email) + '</span></div>'
          + '<span class="status-badge loading"><i class="fa-solid fa-spinner fa-spin"></i> Reading...</span>'
          + '</div>'
          + '<div class="account-result-body">Processing account...</div>'
          + '</div>';
      }).join('');
      inboxSection.style.display = 'block';
      noResults.style.display = 'none';
      var hdr = document.getElementById('emailResultsHeader');
      if (hdr) {
        var y = hdr.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }

    /* ── build table ── */
    function buildTable(msgs, ai) {
      if (!msgs || !msgs.length) return '<div class="empty-mail">No emails found.</div>';
      var lv = globalLimit ? globalLimit.value : 'all';
      var rows = (lv !== 'all') ? msgs.slice(0, parseInt(lv, 10)) : msgs;
      var h = '<div class="rm-table-wrap"><div style="overflow-x:auto"><table><thead><tr>'
        + '<th>#</th><th>From</th><th>Subject</th><th>Date</th><th>Code</th><th>Action</th>'
        + '</tr></thead><tbody>';
      rows.forEach(function (msg, mi) {
        var from = (Array.isArray(msg.from) && msg.from.length) ? (msg.from[0].address || '') : (msg.from || '');
        h += '<tr>'
          + '<td>' + (mi + 1) + '</td>'
          + '<td>' + esc(from) + '</td>'
          + '<td>' + esc(msg.subject || '') + '</td>'
          + '<td>' + fmtDate(msg.date || msg.receivedDateTime) + '</td>'
          + '<td style="text-align:center">' + (msg.code ? '<span class="code-badge">' + esc(msg.code) + '</span>' : '&mdash;') + '</td>'
          + '<td style="text-align:center">'
          + '<button class="action-btn secondary rm-scope" onclick="rmViewEmail(' + ai + ',' + mi + ')" style="padding:.28rem .6rem;font-size:.76rem">'
          + '<i class="fa-solid fa-eye"></i> View</button>'
          + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
      return h;
    }

    function renderSuccess(index, item) {
      var card = document.getElementById('rm-acc-' + index);
      if (!card) return;
      window.rmAccountResults[index] = item;
      var msgs = Array.isArray(item.messages) ? item.messages : [];
      card.innerHTML = '<div class="account-result-header">'
        + '<div><strong>#' + (index + 1) + '</strong><span style="word-break:break-all">' + esc(item.email || '') + '</span></div>'
        + '<span class="status-badge success"><i class="fa-solid fa-circle-check"></i> ' + msgs.length + ' email(s)</span>'
        + '</div>'
        + '<div class="account-result-body">' + buildTable(msgs, index) + '</div>';
    }

    function renderError(index, email, message) {
      var card = document.getElementById('rm-acc-' + index);
      if (!card) return;
      card.innerHTML = '<div class="account-result-header">'
        + '<div><strong>#' + (index + 1) + '</strong><span>' + esc(email || '') + '</span></div>'
        + '<span class="status-badge error"><i class="fa-solid fa-circle-xmark"></i> Error</span>'
        + '</div>'
        + '<div class="account-result-body error-text">' + esc(message) + '</div>';
    }

    /* ── read one account ── */
    function readOne(account, index) {
      return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([account])
      })
        .then(function (resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.json();
        })
        .then(function (data) {
          var item = data && data.data && data.data[0];
          if (!item || item.status === false) {
            renderError(index, account.email, (item && item.message) || 'Unable to read emails.');
          } else {
            renderSuccess(index, item);
          }
        })
        .catch(function (err) {
          renderError(index, account.email, 'Connection error: ' + err.message);
        });
    }

    /* ── view email ── */
    window.rmViewEmail = function (ai, mi) {
      var item = window.rmAccountResults[ai];
      if (!item) return;
      var msg = Array.isArray(item.messages) ? item.messages[mi] : null;
      if (!msg) return;
      allEmails = [{ body: msg.message || msg.text_body || msg.bodyPreview || '(No content)' }];
      openEmailView(0);
    };

    function openEmailView(idx) {
      var msg = allEmails[idx];
      if (!msg || !emailContent || !emailModal) return;
      var raw = msg.body;
      var isHtml = /<\/?[a-z][\s\S]*>/i.test(raw);

      var safeBody = isHtml ? raw
        : '<pre style="white-space:pre-wrap;word-break:break-word;font-family:Arial,sans-serif;font-size:14px;line-height:1.6">' + esc(raw) + '</pre>';

      /* Use srcdoc — avoids Live Server / WP script injection via doc.write */
      var iframeDoc = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
        + '<style>html,body{margin:0;padding:0;background:#fff;color:#2d3748}'
        + 'body{padding:16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;word-break:break-word}'
        + 'a{color:#2B6CB0!important}img{max-width:100%!important}table{max-width:100%}'
        + '</style></head><body>' + safeBody + '</body></html>';

      emailContent.innerHTML = '<iframe id="rmMailFrame" style="width:100%;height:100%;border:0;display:block" sandbox="allow-same-origin allow-popups"></iframe>';
      emailModal.classList.add('is-open');

      /* srcdoc is set after the iframe is in the DOM */
      setTimeout(function () {
        var f = document.getElementById('rmMailFrame');
        if (f) f.srcdoc = iframeDoc;
      }, 50);
    }

    /* ── read button ── */
    btnRead.addEventListener('click', function () {
      var raw = credInput.value.trim();
      if (!raw) { showFormatError(); return; }

      var lines = raw.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      var valid = [], invalid = [];
      lines.forEach(function (l) {
        var p = parseLine(l);
        if (p) valid.push(p); else invalid.push(l);
      });

      if (!valid.length) { showFormatError(); return; }

      btnRead.disabled = true;
      var oldHtml = btnRead.innerHTML;
      btnRead.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading...';

      renderSkeleton(valid);

      var tasks = valid.map(function (acc, i) { return readOne(acc, i); });
      Promise.all(tasks.map(function (p) { return p.then(null, function () {}); }))
        .then(function () {
          btnRead.disabled = false;
          btnRead.innerHTML = oldHtml;
          if (invalid.length) toast('Skipped ' + invalid.length + ' invalid line(s)', 'info');
        });
    });

    /* ── file upload ── */
    fileUpload.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        credInput.value = (ev.target.result || '').replace(/^ORDER:\s*/gm, '').trim();
        updateCount();
        toast('File loaded!', 'success');
        fileUpload.value = '';
      };
      reader.readAsText(file);
    });

    /* ── limit change ── */
    globalLimit.addEventListener('change', function () {
      Object.keys(window.rmAccountResults).forEach(function (i) {
        renderSuccess(Number(i), window.rmAccountResults[i]);
      });
    });

    /* ── modal close ── */
    emailClose.addEventListener('click', function () { emailModal.classList.remove('is-open'); });
    emailModal.addEventListener('click', function (e) {
      if (e.target === emailModal) emailModal.classList.remove('is-open');
    });

    /* ── auto-fill from URL params ── */
    (function () {
      var p = new URLSearchParams(window.location.search);
      var email = safeDecode(p.get('email'));
      var pass  = safeDecode(p.get('password'));
      var at    = safeDecode(p.get('access_token'));
      var rt    = safeDecode(p.get('refresh_token'));
      var cid   = safeDecode(p.get('client_id'));
      if (!email || !pass || !rt || !cid) return;
      var san = function (v) { return v.replace(/\|/g, ''); };
      credInput.value = [san(email), san(pass), san(at), san(rt), san(cid)].join('|');
      updateCount();
      setTimeout(function () { btnRead.click(); }, 400);
    }());

    updateCount();
  } /* end init() */

  /* Always use DOMContentLoaded — this prevents Live Server's injected
     script from racing with our code and causing JS to render as text. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
