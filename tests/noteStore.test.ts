import assert from 'node:assert/strict';
import test from 'node:test';
import { useNoteStore } from '../src/stores/noteSlice';

function reset() {
  useNoteStore.setState({
    sources: [],
    caches: {},
    readAt: {},
    hiddenUrls: [],
    blockedKeywords: [],
    seededAt: null,
  });
}

test('ensureDefaults seeds four topics and blocked words exactly once', () => {
  reset();
  useNoteStore.getState().ensureDefaults();

  const seeded = useNoteStore.getState();
  assert.equal(seeded.sources.length, 4);
  assert.ok(seeded.sources.every((source) => source.enabled));
  assert.deepEqual(
    seeded.sources.map((source) => source.key),
    ['エッセイ', '暮らし', '読書', '小説']
  );
  assert.ok(seeded.blockedKeywords.includes('政治'));
  assert.ok(seeded.seededAt);

  useNoteStore.getState().addSource({ kind: 'author', key: 'seoyun' });
  useNoteStore.getState().ensureDefaults();
  assert.equal(useNoteStore.getState().sources.length, 5);
});

test('addSource rejects duplicates, more than 8 enabled and more than 20 total', () => {
  reset();
  const store = useNoteStore.getState();

  for (let index = 0; index < 8; index += 1) {
    assert.ok(store.addSource({ kind: 'hashtag', key: `tag${index}` }));
  }
  assert.equal(useNoteStore.getState().sources.length, 8);

  assert.equal(store.addSource({ kind: 'hashtag', key: 'tag8' }), null);
  assert.equal(useNoteStore.getState().sources.length, 8);

  assert.equal(
    store.addSource({ kind: 'author', key: 'writer', enabled: false }),
    'author:writer'
  );
  assert.equal(store.addSource({ kind: 'author', key: 'writer' }), 'author:writer');
  assert.equal(useNoteStore.getState().sources.length, 9);
  assert.equal(
    useNoteStore.getState().sources.filter((source) => source.enabled).length,
    8
  );

  for (let index = 0; index < 11; index += 1) {
    assert.ok(
      store.addSource({
        kind: 'author',
        key: `writer${index}`,
        enabled: false,
      })
    );
  }
  assert.equal(useNoteStore.getState().sources.length, 20);
  assert.equal(
    store.addSource({ kind: 'author', key: 'writer-over', enabled: false }),
    null
  );
});

test('toggleSource respects the enabled cap and removeSource clears its cache', () => {
  reset();
  const store = () => useNoteStore.getState();

  for (let index = 0; index < 8; index += 1) {
    store().addSource({ kind: 'hashtag', key: `tag${index}` });
  }
  store().addSource({ kind: 'author', key: 'ninth', enabled: false });

  assert.equal(store().toggleSource('author:ninth'), false);
  assert.equal(
    store().sources.find((source) => source.id === 'author:ninth')?.enabled,
    false
  );

  assert.equal(store().toggleSource('hashtag:tag0'), true);
  assert.equal(store().toggleSource('author:ninth'), true);

  store().setCache({
    sourceId: 'author:ninth',
    items: [],
    fetchedAt: Date.now(),
  });
  store().removeSource('author:ninth');
  assert.equal(store().caches['author:ninth'], undefined);
});

test('read, hide and blocked-keyword state normalize URLs', () => {
  reset();
  const store = () => useNoteStore.getState();

  store().markRead('https://note.com/a/n/n1?from=feed');
  assert.ok(store().readAt['https://note.com/a/n/n1']);

  store().hideItem('https://note.com/a/n/n2#top');
  store().hideItem('https://note.com/a/n/n2?again=1');
  assert.deepEqual(store().hiddenUrls, ['https://note.com/a/n/n2']);

  store().unhideItem('https://note.com/a/n/n2');
  assert.deepEqual(store().hiddenUrls, []);

  store().hideItem('https://note.com/a/n/n3');
  store().clearHidden();
  assert.deepEqual(store().hiddenUrls, []);

  store().setBlockedKeywords([' 政治 ', '政治', '', '選挙']);
  assert.deepEqual(store().blockedKeywords, ['政治', '選挙']);
});

test('read and hidden histories stay bounded', () => {
  reset();
  const store = () => useNoteStore.getState();

  for (let index = 0; index < 505; index += 1) {
    store().markRead(`https://note.com/a/n/n${index}`);
    store().hideItem(`https://note.com/a/n/h${index}`);
  }

  assert.equal(Object.keys(store().readAt).length, 500);
  assert.equal(store().hiddenUrls.length, 500);
  assert.ok(store().hiddenUrls.includes('https://note.com/a/n/h504'));
});
