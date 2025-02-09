import anime from 'animejs';

const CONFIG = {
  animation: {
    defaultDuration: 200,
    defaultEasing: 'easeOutQuad',
    playbackEasing: 'linear',
    playbackTransitionDuration: 50,
    highlightToPastDuration: 600,
  },
  colors: {
    active: '#7E85FF',
    read: 'rgba(212, 214, 230, 0.75)',
    unread: 'rgba(243, 243, 247, 0.90)',
  },
  speed: {
    charactersPerMinute: 1000,
    get secondsPerChar() {
      return 60 / this.charactersPerMinute;
    },
  },
};

const transcriptData = [
  {
    speaker: 'Speaker 1',
    text: "Howdy, I'm Chris, an engineer on the AVFoundation team.",
  },
  {
    speaker: 'Speaker 1',
    text: "I'd like to welcome you to our session on preparing and delivering streaming content for spatial experiences. To begin, we'll briefly review how to produce, prepare, and deliver 2D media using HTTP Live Streaming (HLS). With that foundation in place, we'll then look at 3D video content, what's currently supported and how to adapt the 2D workflow to accommodate these immersive experiences.",
  },
  {
    speaker: 'Speaker 2',
    text: 'When considering the content pipeline, we start with encoding video, audio, and captions. Next, those encoded resources need to be packaged, ready for HLS delivery. This is the same approach used to deliver 2D content today, and our goal is to build upon these familiar processes for 3D.',
  },
  {
    speaker: 'Speaker 2',
    text: 'One key update here is HLS support for fragmented MP4 timed metadata, which enables an important new level of adaptation for spatial experiences.',
  },
  {
    speaker: 'Speaker 1',
    text: 'For more details, see the HTTP Live Streaming page on the Apple Developer website. It provides links to documentation, tools, example streams, developer forums, and other resources relevant to preparing and delivering HLS content. This same pipeline and knowledge base apply to delivering audiovisual media across Apple platforms, now extended to support a new spatial paradigm.',
  },
];

const formatTime = seconds => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const getWordState = (word, currentTime) => {
  const inTime = CONFIG.animation.playbackTransitionDuration / 1000;
  const outTime = CONFIG.animation.highlightToPastDuration / 1000;

  if (currentTime < word.start - inTime) return 'future';
  if (currentTime < word.start) return 'transitioningIn';
  if (currentTime < word.end) return 'active';
  if (currentTime < word.end + outTime) return 'transitioningOut';
  return 'past';
};

const processWords = (text, startTime) => {
  const words = text.split(' ');
  let charCount = 0;

  return words.map(word => {
    const chars = word.replace(/\s+/g, '').length;
    const start = startTime + charCount * CONFIG.speed.secondsPerChar;
    charCount += chars;
    const end = startTime + charCount * CONFIG.speed.secondsPerChar;

    return { text: word, start, end, chars };
  });
};

const createSegment = (startTime, speaker, text) => {
  const totalChars = text.replace(/\s+/g, '').length;
  const duration = totalChars * CONFIG.speed.secondsPerChar;
  const end = startTime + duration;
  const words = processWords(text, startTime);

  return { speaker, text, start: startTime, end, words };
};

const updateWordElements = (spans, words, currentTime, isPlaying) => {
  spans.forEach((span, i) => {
    const word = words[i];
    const newState = getWordState(word, currentTime);
    const oldState = span.dataset.state;

    if (!isPlaying || oldState !== newState) {
      span.dataset.state = newState;
      const duration =
        newState === 'transitioningOut' && isPlaying
          ? CONFIG.animation.highlightToPastDuration
          : CONFIG.animation.defaultDuration;

      const colors = {
        future: CONFIG.colors.unread,
        transitioningIn: CONFIG.colors.active,
        active: CONFIG.colors.active,
        transitioningOut: CONFIG.colors.read,
        past: CONFIG.colors.read,
      };

      anime.remove(span);
      anime({
        targets: span,
        duration,
        color: colors[newState],
        easing: isPlaying
          ? CONFIG.animation.playbackEasing
          : CONFIG.animation.defaultEasing,
      });
    }
  });
};

const createTranscriptPlayer = transcriptData => {
  let currentTime = 0;
  let isPlaying = false;
  let startTime = null;
  let pausedAt = 0;

  const container = document.querySelector('.transcript-container');
  const segmentsContainer = document.getElementById('segments-container');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const template = document.getElementById('segment-template');

  let time = 0;
  const segments = transcriptData.map(data => {
    const segment = createSegment(time, data.speaker, data.text);
    time = segment.end;
    return segment;
  });

  const duration = Math.max(...segments.map(s => s.end));

  const createSegmentElement = segment => {
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.transcript-segment');

    el.querySelector('.timestamp').textContent =
      `${formatTime(segment.start)} / ${formatTime(segment.end)}`;
    el.querySelector('.speaker').textContent = segment.speaker;
    el.querySelector('.text').innerHTML = segment.words
      .map(
        word =>
          `<span class="future" data-start="${word.start}">${word.text}</span>`
      )
      .join(' ');

    return el;
  };

  const update = (time, isPlaying) => {
    segments.forEach(segment => {
      const spans = segment.element.querySelectorAll('.text span');
      updateWordElements(spans, segment.words, time, isPlaying);
    });
  };

  const animate = () => {
    if (!isPlaying) return;

    const elapsed = (performance.now() - startTime) / 1000;

    if (elapsed >= duration) {
      update(duration, false);
      isPlaying = false;
      pausedAt = 0;
    } else {
      currentTime = elapsed;
      update(elapsed, true);
      requestAnimationFrame(animate);
    }
  };

  const play = () => {
    isPlaying = true;
    startTime = performance.now() - pausedAt * 1000;
    requestAnimationFrame(animate);
  };

  const pause = () => {
    isPlaying = false;
    pausedAt = currentTime;
  };

  const seek = time => {
    if (isPlaying) {
      pause();
      currentTime = pausedAt = time;
      update(time, false);
      play();
    } else {
      currentTime = pausedAt = time;
      update(time, false);
    }
  };

  const reset = () => {
    pause();
    currentTime = pausedAt = 0;
    segments.forEach(segment => {
      const spans = segment.element.querySelectorAll('.text span');
      anime.remove(spans);
      spans.forEach(span => {
        span.style.color = CONFIG.colors.unread;
        span.dataset.state = 'future';
      });
    });
  };

  segments.forEach(segment => {
    segment.element = createSegmentElement(segment);
    segmentsContainer.appendChild(segment.element);
  });

  playPauseBtn.onclick = () => {
    isPlaying ? pause() : play();
    playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
  };

  resetBtn.onclick = () => {
    reset();
    playPauseBtn.textContent = 'Play';
  };

  segmentsContainer.onclick = e => {
    if (e.target.tagName === 'SPAN' && e.target.dataset.start) {
      window.getSelection().removeAllRanges();
      seek(parseFloat(e.target.dataset.start));
    }
  };

  return { play, pause, seek, reset };
};

const player = createTranscriptPlayer(transcriptData);
