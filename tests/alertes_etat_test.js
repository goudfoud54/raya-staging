// État lisible des alertes (alertes.js) — fonctions PURES. Le rendu (badges, bandeau, bouton test)
// n'est pas testable ici : relu, non exécuté en navigateur.
require('../alertes.js'); // IIFE → pose etatAlerte / alerteOperationnelle / alertesManquantes sur globalThis

let ok = true; const t = (l, c) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l); ok = c && ok; };

// ── etatAlerte : les 4 sévérités ──
t('null → absente (« non configurée »)', (() => { const e = etatAlerte(null, 'stock'); return e.severite === 'absente' && /non configurée/.test(e.label); })());
t('stock actif + email → ok, « active — email · 22:30 »', (() => { const e = etatAlerte({ actif: true, email_alerte: 'a@b.fr', heure_check: '22:30:00' }, 'stock'); return e.severite === 'ok' && e.label === 'active — email · 22:30'; })());
t('stock actif + email + WhatsApp → deux canaux', (() => { const e = etatAlerte({ actif: true, email_alerte: 'a@b.fr', wa_groupe_id: '123@g.us', heure_check: '22:30' }, 'stock'); return e.severite === 'ok' && e.label === 'active — email + WhatsApp · 22:30'; })());
t('stock actif SANS destinataire → sans_dest (« rien ne partira »)', (() => { const e = etatAlerte({ actif: true }, 'stock'); return e.severite === 'sans_dest' && /rien ne partira/.test(e.label); })());
t('stock inactif mais email renseigné → inactive', (() => { const e = etatAlerte({ actif: false, email_alerte: 'a@b.fr' }, 'stock'); return e.severite === 'inactive'; })());
t('stock : heure du check reflétée dans le label (20:30)', etatAlerte({ actif: true, email_alerte: 'a@b.fr', heure_check: '20:30' }, 'stock').label === 'active — email · 20:30');

// ── retard : push salarié compte comme canal ; pas d'heure dans le label ──
t('retard actif + push salarié seul → ok, canal « push salarié »', (() => { const e = etatAlerte({ actif: true, notif_salarie: true }, 'retard'); return e.severite === 'ok' && e.canaux.join() === 'push salarié' && !/·/.test(e.label); })());
t('retard actif + email → ok', etatAlerte({ actif: true, email_alerte: 'x@y.fr' }, 'retard').severite === 'ok');
t('retard null → absente', etatAlerte(null, 'retard').severite === 'absente');
t('retard : notif_salarie ignoré côté stock (pas de canal push en stock)', etatAlerte({ actif: true, notif_salarie: true }, 'stock').severite === 'sans_dest');

// ── alerteOperationnelle ──
t('opérationnelle = true seulement si active + destinataire', alerteOperationnelle({ actif: true, email_alerte: 'a@b.fr' }, 'stock') === true
  && alerteOperationnelle({ actif: true }, 'stock') === false
  && alerteOperationnelle({ actif: false, email_alerte: 'a@b.fr' }, 'stock') === false
  && alerteOperationnelle(null, 'stock') === false);

// ── alertesManquantes (bandeau portail) ──
const restos = [{ id: 'r1', nom: 'A', actif: true }, { id: 'r2', nom: 'B', actif: true }, { id: 'r3', nom: 'C', actif: true }, { id: 'r4', nom: 'D', actif: false }];
const stockCfg = { r1: { actif: true, email_alerte: 'a@b.fr' }, r2: { actif: false }, r4: { actif: true, email_alerte: 'z@z.fr' } };
const retardCfg = { r1: { actif: true, notif_salarie: true } };
const miss = alertesManquantes(restos, stockCfg, retardCfg);
t('bandeau : r1 tout OK → absent de la liste', !miss.find(m => m.id === 'r1'));
t('bandeau : r2 stock inactif + retard absent → manque [stock,retard]', (() => { const m = miss.find(x => x.id === 'r2'); return m && m.manque.includes('stock') && m.manque.includes('retard'); })());
t('bandeau : r3 aucune config → manque [stock,retard]', (() => { const m = miss.find(x => x.id === 'r3'); return m && m.manque.length === 2; })());
t('bandeau : r4 INACTIF exclu même si config présente', !miss.find(m => m.id === 'r4'));
t('bandeau : tout opérationnel → liste vide', alertesManquantes([{ id: 'r1', nom: 'A', actif: true }], { r1: { actif: true, email_alerte: 'a@b.fr' } }, { r1: { actif: true, email_alerte: 'a@b.fr' } }).length === 0);

console.log(ok ? '\nALL PASS' : '\nSOME FAILED'); process.exit(ok ? 0 : 1);
