const TRANSCRIPT_CONFIG = {
  animation: {
    stateTransitionDuration: 300,
    easing: 'easeOutQuad',
    linearEasing: 'linear',
  },
  colors: {
    primary: '#5B53FF',
    highlight: '#7E85FF',
    pastText: 'rgba(212, 214, 230, 0.75)',
    futureText: 'rgba(243, 243, 247, 0.90)',
  },
  transcript: {
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

class TranscriptSegment {
  constructor(start, end, speaker, text) {
    this.start = start;
    this.text = text;
    this.speaker = speaker;

    this.totalChars = this.countChars(text);
    this.duration =
      this.totalChars * TRANSCRIPT_CONFIG.transcript.secondsPerChar;
    this.end = this.start + this.duration;

    this.words = this.processWords(text);
    this.element = this.createSegmentElement();
  }

  countChars(text) {
    return text.replace(/\s+/g, '').length;
  }

  processWords(text) {
    const words = text.split(' ');
    let charCount = 0;

    return words.map(word => {
      const wordChars = this.countChars(word);
      const wordStart =
        this.start + charCount * TRANSCRIPT_CONFIG.transcript.secondsPerChar;
      charCount += wordChars;
      const wordEnd =
        this.start + charCount * TRANSCRIPT_CONFIG.transcript.secondsPerChar;

      return {
        text: word,
        start: wordStart,
        end: wordEnd,
        chars: wordChars,
      };
    });
  }

  createSegmentElement() {
    const segment = document.createElement('div');
    segment.className = 'transcript-segment';

    const content = document.createElement('div');
    content.className = 'content';

    const header = document.createElement('div');
    header.className = 'header';

    const timestamp = document.createElement('span');
    timestamp.textContent = `${formatTime(this.start)} / ${formatTime(this.end)}`;

    const bulletPoint = document.createElement('span');
    bulletPoint.className = 'bullet-point';

    const speakerEl = document.createElement('span');
    speakerEl.textContent = this.speaker;

    header.appendChild(timestamp);
    header.appendChild(bulletPoint);
    header.appendChild(speakerEl);

    const text = document.createElement('div');
    text.className = 'text';

    this.words.forEach((word, index) => {
      const span = document.createElement('span');
      span.textContent = word.text;
      span.className = 'future';
      span.dataset.start = word.start;
      span.style.cursor = 'pointer';
      text.appendChild(span);

      if (index < this.words.length - 1) {
        text.appendChild(document.createTextNode(' '));
      }
    });

    content.appendChild(header);
    content.appendChild(text);
    segment.appendChild(content);

    return segment;
  }

  update(currentTime, shouldAnimate = true, isPlaying = false) {
    if (currentTime >= this.end) {
      this.updateWordStates('past', isPlaying);
    } else {
      this.updateWordProgress(currentTime, isPlaying);
    }
  }

  updateWordStates(state, isPlaying = false) {
    const spans = this.element.querySelectorAll('.text span');
    const colors = {
      past: TRANSCRIPT_CONFIG.colors.pastText,
      future: TRANSCRIPT_CONFIG.colors.futureText,
      current: TRANSCRIPT_CONFIG.colors.highlight,
    };

    anime({
      targets: spans,
      color: colors[state],
      duration: TRANSCRIPT_CONFIG.animation.stateTransitionDuration,
      easing: TRANSCRIPT_CONFIG.animation.easing,
    });
  }

  updateWordProgress(currentTime, isPlaying = false) {
    const spans = this.element.querySelectorAll('.text span');
    const targets = [];
    const colors = [];

    this.words.forEach((word, index) => {
      const span = spans[index];
      let newState;
      let newColor;

      if (currentTime < word.start) {
        newState = 'future';
        newColor = TRANSCRIPT_CONFIG.colors.futureText;
      } else if (currentTime >= word.end) {
        newState = 'past';
        newColor = TRANSCRIPT_CONFIG.colors.pastText;
      } else {
        newState = 'highlight';
        newColor = TRANSCRIPT_CONFIG.colors.highlight;
      }

      // Always update during seeking (when not playing)
      if (!isPlaying || span.dataset.state !== newState) {
        span.dataset.state = newState;
        targets.push(span);
        colors.push(newColor);
      }
    });

    if (targets.length > 0) {
      // Instant transition for seeking, animated for playback
      const duration = isPlaying ? 50 : 0;

      const easing = isPlaying
        ? TRANSCRIPT_CONFIG.animation.linearEasing
        : 'linear';

      anime({
        targets,
        color: (el, i) => colors[i],
        duration,
        easing,
      });
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
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(time) {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.currentTime = time;
    this.pausedAt = time;
    this.transcript.updateAllSegments(time, true, false);
    if (wasPlaying) {
      this.play();
    }
  }

  reset() {
    this.pause();
    this.currentTime = 0;
    this.pausedAt = 0;
    this.transcript.resetAllSegments();
    this.transcript.playPauseBtn.textContent = 'Play';
  }

  animate() {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsed = (now - this.startTime) / 1000;
    const totalDuration = this.transcript.getTotalDuration();

    if (elapsed >= totalDuration) {
      this.transcript.updateAllSegments(totalDuration, true, false);
      this.pause();
      this.pausedAt = 0;
    } else {
      this.currentTime = elapsed;
      this.transcript.updateAllSegments(elapsed, true, true);
      requestAnimationFrame(() => this.animate());
    }
  }
}

class Transcript {
  constructor(segments) {
    let currentTime = 0;
    this.segments = segments.map(segment => {
      const transcriptSegment = new TranscriptSegment(
        currentTime,
        null,
        segment.speaker,
        segment.text
      );
      currentTime = transcriptSegment.end;
      return transcriptSegment;
    });

    this.container = document.querySelector('.transcript-container');
    this.segmentsContainer = document.getElementById('segments-container');
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.resetBtn = document.getElementById('resetBtn');

    this.playbackController = new PlaybackController(this);
    this.setupControls();
    this.setupWordClickHandlers();
    this.renderSegments();
  }

  getTotalDuration() {
    return Math.max(...this.segments.map(s => s.end));
  }

  setupWordClickHandlers() {
    this.segmentsContainer.addEventListener('click', e => {
      if (e.target.tagName === 'SPAN' && e.target.dataset.start) {
        const time = parseFloat(e.target.dataset.start);
        this.playbackController.seek(time);
      }
    });
  }

  setupControls() {
    this.playPauseBtn.onclick = () => {
      this.playbackController.togglePlayback();
      this.playPauseBtn.textContent = this.playbackController.isPlaying
        ? 'Pause'
        : 'Play';
    };

    this.resetBtn.onclick = () => this.playbackController.reset();
  }

  renderSegments() {
    this.segments.forEach(segment => {
      this.segmentsContainer.appendChild(segment.element);
    });
  }

  updateAllSegments(time, forceAnimate = false, isPlaying = false) {
    this.segments.forEach(segment => {
      const shouldAnimate =
        isPlaying || (time >= segment.start && time <= segment.end);
      segment.update(time, shouldAnimate, isPlaying);
    });
  }

  resetAllSegments() {
    this.segments.forEach(segment => {
      const spans = segment.element.querySelectorAll('.text span');
      anime.remove(spans);
      spans.forEach(span => {
        span.style.color = TRANSCRIPT_CONFIG.colors.futureText;
      });
      segment.updateWordStates('future');
    });
  }
}

// Demo data
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
