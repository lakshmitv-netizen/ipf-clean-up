/*
 * Injected into the saved Data Processing Engine list view (dpe_listview.html).
 *
 * Maps clicks on a job-definition name to the corresponding detail page:
 *   "Define Dimension Hierarchy for Account Forecasting..."     -> 1stdpe.html
 *   "Build Account-Product Relationships for Account Forecast.." -> 2nddpe.html
 *   "Define Baseline Measures for Account Forecasting..."        -> dpe_definition_2_2.html
 */
(function () {
  'use strict';

  function normalize(text) {
    // Collapse dash variants (– — -) and whitespace so matching is robust.
    return (text || '').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  }

  function targetFor(text) {
    var t = normalize(text);
    if (t.indexOf('Define Dimension Hierarchy for Account Forecasting') !== -1) {
      return '1stdpe.html';
    }
    if (
      t.indexOf('Build Account') !== -1 &&
      t.indexOf('Product Relationships for Account Forecasting') !== -1
    ) {
      return '2nddpe.html';
    }
    if (t.indexOf('Define Baseline Measures for Account Forecasting') !== -1) {
      return 'dpe_definition_2_2.html';
    }
    return null;
  }

  document.addEventListener(
    'click',
    function (e) {
      var link = e.target.closest('a');
      if (!link) return;
      var dest = targetFor(link.textContent);
      if (!dest) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.href = dest;
    },
    true
  );

  // Remove the trailing row-action ("Show Actions") column — the rightmost
  // column of controls in the list view — from the header and every row.
  function removeLastColumn() {
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      // Only touch the data grid (rows carry the job-name row header).
      if (!table.querySelector('th[scope="row"]')) continue;
      var rows = table.querySelectorAll('tr');
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].children;
        if (cells.length) {
          rows[r].removeChild(cells[cells.length - 1]);
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeLastColumn);
  } else {
    removeLastColumn();
  }
})();
