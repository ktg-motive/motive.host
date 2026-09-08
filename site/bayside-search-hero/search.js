/* BaySide bond search. External file: motive.host CSP is script-src 'self'. */
(function () {
  "use strict";
  var BONDS = [{"name":"Notary Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Public Official Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Utility Deposit Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"New / Used Motor Vehicle Dealer Bonds","line":"Commercial","note":"","group":"","alt":"auto dealer car"},{"name":"Bond of Designated Agents","line":"Commercial","note":"","group":"","alt":""},{"name":"Wholesaler & Dismantlers Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Certificate of Title Bonds","line":"Commercial","note":"","group":"","alt":"title"},{"name":"DEMPOS (Medicare) Bonds","line":"Commercial","note":"","group":"","alt":"medicare dme"},{"name":"Patient Trust Fund Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Contractor's License & Permit Bonds","line":"Commercial","note":"","group":"","alt":"license permit contractor"},{"name":"Contractor's Tax Bonds","line":"Commercial","note":"","group":"","alt":"tax"},{"name":"Liquor Liability Bonds","line":"Commercial","note":"","group":"","alt":"alcohol"},{"name":"Financially Responsible Officer Bonds","line":"Commercial","note":"","group":"","alt":"FRO"},{"name":"ERISA Bonds","line":"Commercial","note":"","group":"","alt":"pension benefit plan fidelity"},{"name":"Janitorial Services Bonds","line":"Commercial","note":"","group":"","alt":"cleaning"},{"name":"Employee Dishonesty Bonds","line":"Commercial","note":"","group":"","alt":"fidelity theft"},{"name":"Mortgage Broker Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Title Pledge and Check Cashing Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Right-of-Way Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Subdivision Performance and Maintenance Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Annual Renewable Service Contracts","line":"Commercial","note":"","group":"","alt":""},{"name":"Stockyards and Packer's Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Agricultural Products Dealer Bonds","line":"Commercial","note":"","group":"","alt":"farm"},{"name":"Manufactured Home Bonds, Dealers and Installers","line":"Commercial","note":"","group":"","alt":"mobile home"},{"name":"Surplus Lines Broker Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Public Adjuster Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Postsecondary Education Bonds","line":"Commercial","note":"","group":"","alt":"school college"},{"name":"Auctioneer Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Inspection Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Petroleum Fuel Bonds","line":"Commercial","note":"","group":"","alt":"gas"},{"name":"Pest Control Bonds","line":"Commercial","note":"","group":"","alt":"exterminator"},{"name":"On-Site Waste Water Bonds","line":"Commercial","note":"","group":"","alt":"septic"},{"name":"Pawn Broker Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Lottery Bonds","line":"Commercial","note":"","group":"","alt":""},{"name":"Waste Management Bonds","line":"Commercial","note":"","group":"","alt":"garbage hauling"},{"name":"Bid Bond","line":"Contract","note":"$350,000 and over, or express","group":"","alt":""},{"name":"Final Bond (Performance & Payment)","line":"Contract","note":"$350,000 and over","group":"","alt":""},{"name":"SBA Guarantee Program Bond","line":"Contract","note":"SBA guarantees 70 to 90 percent","group":"","alt":"small business emerging contractor"},{"name":"Administrator Bond","line":"Court","note":"Estate with no will","group":"Probate / Fiduciary","alt":""},{"name":"Executor Bond","line":"Court","note":"Named in a will","group":"Probate / Fiduciary","alt":""},{"name":"Guardian Bond","line":"Court","note":"Minor or incompetent","group":"Probate / Fiduciary","alt":""},{"name":"Conservator Bond","line":"Court","note":"Conservatorship","group":"Probate / Fiduciary","alt":""},{"name":"VA Fiduciary Bond","line":"Court","note":"Veterans Affairs funds","group":"Probate / Fiduciary","alt":""},{"name":"Supersedeas Bond","line":"Court","note":"Appeal, stays a judgment","group":"Court / Judicial","alt":"appeal"},{"name":"Replevin Bond","line":"Court","note":"Judicial","group":"Court / Judicial","alt":""},{"name":"Injunction Bond","line":"Court","note":"Judicial","group":"Court / Judicial","alt":""},{"name":"Release of Mechanics Lien Bond","line":"Court","note":"Judicial","group":"Court / Judicial","alt":"lien"},{"name":"ICC Property Broker Bond","line":"Transportation","note":"BMC-84, $75,000 penal sum","group":"","alt":"BMC84 BMC 84 freight broker FMCSA"},{"name":"Highway Use Tax Bonds","line":"Transportation","note":"","group":"","alt":"tax"},{"name":"Oversize Permit Bonds","line":"Transportation","note":"","group":"","alt":"overweight"},{"name":"HELP-Prepass Bonds","line":"Transportation","note":"","group":"","alt":"prepass"},{"name":"Federal Carrier Registration Bonds","line":"Transportation","note":"","group":"","alt":"FMCSA registration"}];

  function ready(fn) {
    if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); }
  }

  ready(function () {
    var input = document.querySelector('[data-bsg="input"]');
    var panel = document.querySelector('[data-bsg="panel"]');
    var list  = document.querySelector('[data-bsg="list"]');
    var empty = document.querySelector('[data-bsg="empty"]');
    var proto = document.getElementById("bsg-proto");
    if (!input || !panel || !list || !empty || !proto) { return; }

    var kids = proto.content.querySelectorAll('[data-bsg="head"], [data-bsg="item"]');
    var headProto = null, itemProto = null;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].getAttribute("data-bsg") === "head" && !headProto) { headProto = kids[i]; }
      if (kids[i].getAttribute("data-bsg") === "item" && !itemProto) { itemProto = kids[i]; }
    }
    if (!headProto || !itemProto) { return; }

    var LIMIT = 7;

    function matches(q) {
      var t = q.trim().toLowerCase();
      if (!t) { return []; }
      return BONDS.filter(function (b) {
        return (b.name + " " + b.line + " " + b.note + " " + b.group + " " + b.alt).toLowerCase().indexOf(t) >= 0;
      }).slice(0, LIMIT);
    }

    function setText(el, hook, text) {
      var t = el.querySelector('[data-bsg="' + hook + '"]');
      if (t) { t.textContent = text; }
    }

    function render() {
      var hits = matches(input.value);
      var typed = input.value.trim().length > 0;
      panel.style.display = typed ? "block" : "none";
      empty.style.display = typed && !hits.length ? "block" : "none";
      list.style.display = hits.length ? "block" : "none";
      while (list.firstChild) { list.removeChild(list.firstChild); }
      var lastLine = null;
      hits.forEach(function (b) {
        if (b.line !== lastLine) {
          var h = headProto.cloneNode(true);
          h.style.display = "block";
          h.textContent = b.line.toUpperCase();
          list.appendChild(h);
          lastLine = b.line;
        }
        var row = itemProto.cloneNode(true);
        row.style.display = "flex";
        setText(row, "name", b.name);
        setText(row, "note", b.note);
        row.addEventListener("click", function () { input.value = b.name; render(); input.focus(); });
        list.appendChild(row);
      });
    }

    input.addEventListener("input", render);

    var chips = document.querySelectorAll('[data-bsg="chip"]');
    for (var c = 0; c < chips.length; c++) {
      (function (chip) {
        chip.addEventListener("click", function () {
          input.value = (chip.textContent || "").trim();
          render();
          input.focus();
        });
      })(chips[c]);
    }

    var clear = document.querySelector('[data-bsg="clear"]');
    if (clear) { clear.addEventListener("click", function () { input.value = ""; render(); input.focus(); }); }

    // ?q= lets a link open the page mid-search, which the PDF pass uses.
    var m = /[?&]q=([^&]*)/.exec(window.location.search);
    if (m) {
      try {
        input.value = decodeURIComponent(m[1].replace(/\+/g, " "));
      } catch (e) {
        input.value = m[1].replace(/\+/g, " ");
      }
    }
    render();
  });
})();
