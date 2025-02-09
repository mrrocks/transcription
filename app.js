const CONFIG = {
  animation: {
    defaultDuration: 200,
    defaultEasing: 'easeOutQuad',
    playbackEasing: 'linear',
    playbackTransitionDuration: 50,
    highlightToPastDuration: 600,
  },
  colors: {
    primary: '#5B53FF',
    activeWord: '#7E85FF',
    readWords: 'rgba(212, 214, 230, 0.75)',
    unreadWords: 'rgba(243, 243, 247, 0.90)',
  },
  speed: {
    charactersPerMinute: 1000,
    get secondsPerChar() {
      return 60 / this.charactersPerMinute;
    },
  },
};

const formatTime = seconds => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

class Word {
  constructor(text, start, end, chars) {
    this.text = text;
    this.start = start;
    this.end = end;
    this.chars = chars;
    this.state = 'future';
    this.transitionState = 'none';
  }

  getColor() {
    return CONFIG.colors[
      this.state === 'highlight'
        ? 'activeWord'
        : this.state === 'past'
          ? 'readWords'
          : 'unreadWords'
    ];
  }

  updateState(currentTime) {
    const transitionInTime = CONFIG.animation.playbackTransitionDuration / 1000;
    const transitionOutTime = CONFIG.animation.highlightToPastDuration / 1000;

    if (currentTime < this.start - transitionInTime) {
      this.state = 'future';
      this.transitionState = 'none';
    } else if (
      currentTime >= this.start - transitionInTime &&
      currentTime < this.start
    ) {
      this.state = 'highlight';
      this.transitionState = 'transitioning-in';
    } else if (currentTime >= this.start && currentTime < this.end) {
      this.state = 'highlight';
      this.transitionState = 'active';
    } else if (
      currentTime >= this.end &&
      currentTime < this.end + transitionOutTime
    ) {
      this.state = 'past';
      this.transitionState = 'transitioning-out';
    } else {
      this.state = 'past';
      this.transitionState = 'none';
    }
    return this.state;
  }
}

class TranscriptUI {
  constructor() {
    this.container = document.querySelector('.transcript-container');
    this.segmentsContainer = document.getElementById('segments-container');
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.resetBtn = document.getElementById('resetBtn');
  }

  createSegmentElement(segment) {
    const el = document.createElement('div');
    el.className = 'transcript-segment';

    const content = document.createElement('div');
    content.className = 'content';

    content.innerHTML = `
      <div class="header">
        <span>${formatTime(segment.start)} / ${formatTime(segment.end)}</span>
        <span class="bullet-point"></span>
        <span>${segment.speaker}</span>
      </div>
      <div class="text">
        ${segment.words
          .map(
            word =>
              `<span class="future" data-start="${word.start}" style="cursor:pointer">${word.text}</span>`
          )
          .join(' ')}
      </div>
    `;

    el.appendChild(content);
    return el;
  }

  updateWordElements(spans, words, isPlaying) {
    const targets = [];
    const colors = [];
    const durations = [];

    spans.forEach((span, i) => {
      const word = words[i];
      const oldState = span.dataset.state;
      const newState = word.state;

      if (!isPlaying || oldState !== newState) {
        span.dataset.state = newState;
        targets.push(span);
        colors.push(word.getColor());

        durations.push(
          !isPlaying
            ? CONFIG.animation.defaultDuration
            : word.transitionState === 'transitioning-out'
              ? CONFIG.animation.highlightToPastDuration
              : CONFIG.animation.playbackTransitionDuration
        );
      }
    });

    if (targets.length) {
      targets.forEach((target, i) => {
        anime({
          targets: target,
          color: colors[i],
          duration: durations[i],
          easing: isPlaying
            ? CONFIG.animation.playbackEasing
            : CONFIG.animation.defaultEasing,
        });
      });
    }
  }
}

class TranscriptSegment {
  constructor(start, speaker, text, ui) {
    this.start = start;
    this.speaker = speaker;
    this.text = text;
    this.ui = ui;
    this.totalChars = text.replace(/\s+/g, '').length;
    this.duration = this.totalChars * CONFIG.speed.secondsPerChar;
    this.end = this.start + this.duration;
    this.words = this.processWords();
    this.element = null;
  }

  processWords() {
    const words = this.text.split(' ');
    let charCount = 0;

    return words.map(word => {
      const chars = word.replace(/\s+/g, '').length;
      const start = this.start + charCount * CONFIG.speed.secondsPerChar;
      charCount += chars;
      const end = this.start + charCount * CONFIG.speed.secondsPerChar;
      return new Word(word, start, end, chars);
    });
  }

  update(currentTime, isPlaying) {
    this.words.forEach(word => word.updateState(currentTime));
    if (this.element) {
      const spans = this.element.querySelectorAll('.text span');
      this.ui.updateWordElements(spans, this.words, isPlaying);
    }
  }
}

class PlaybackController {
  constructor(transcript) {
    this.transcript = transcript;
    this.currentTime = 0;
    this.isPlaying = false;
    this.startTime = null;
    this.pausedAt = 0;
  }

  play() {
    this.isPlaying = true;
    this.startTime = performance.now() - this.pausedAt * 1000;
    this.animate();
  }

  pause() {
    this.isPlaying = false;
    this.pausedAt = this.currentTime;
  }

  togglePlayback() {
    this.isPlaying ? this.pause() : this.play();
    return this.isPlaying;
  }

  seek(time) {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.currentTime = this.pausedAt = time;
    this.transcript.update(time, false);
    if (wasPlaying) this.play();
  }

  reset() {
    this.pause();
    this.currentTime = this.pausedAt = 0;
    this.transcript.reset();
  }

  animate() {
    if (!this.isPlaying) return;

    const elapsed = (performance.now() - this.startTime) / 1000;

    if (elapsed >= this.transcript.duration) {
      this.transcript.update(this.transcript.duration, false);
      this.pause();
      this.pausedAt = 0;
    } else {
      this.currentTime = elapsed;
      this.transcript.update(elapsed, true);
      requestAnimationFrame(() => this.animate());
    }
  }
}

class Transcript {
  constructor(segments) {
    this.ui = new TranscriptUI();
    this.segments = this.createSegments(segments);
    this.duration = Math.max(...this.segments.map(s => s.end));
    this.playback = new PlaybackController(this);
    this.setupListeners();
    this.render();
  }

  createSegments(data) {
    let time = 0;
    return data.map(segment => {
      const s = new TranscriptSegment(
        time,
        segment.speaker,
        segment.text,
        this.ui
      );
      time = s.end;
      return s;
    });
  }

  setupListeners() {
    this.ui.playPauseBtn.onclick = () => {
      const isPlaying = this.playback.togglePlayback();
      this.ui.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
    };

    this.ui.resetBtn.onclick = () => {
      this.playback.reset();
      this.ui.playPauseBtn.textContent = 'Play';
    };

    this.ui.segmentsContainer.onclick = e => {
      if (e.target.tagName === 'SPAN' && e.target.dataset.start) {
        this.playback.seek(parseFloat(e.target.dataset.start));
      }
    };
  }

  render() {
    this.segments.forEach(segment => {
      segment.element = this.ui.createSegmentElement(segment);
      this.ui.segmentsContainer.appendChild(segment.element);
    });
  }

  update(time, isPlaying) {
    this.segments.forEach(segment => segment.update(time, isPlaying));
  }

  reset() {
    this.segments.forEach(segment => {
      const spans = segment.element.querySelectorAll('.text span');
      anime.remove(spans);
      spans.forEach(span => {
        span.style.color = CONFIG.colors.unreadWords;
        span.dataset.state = 'future';
      });
      segment.words.forEach(word => (word.state = 'future'));
    });
  }
}

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

const transcript = new Transcript(transcriptData);
