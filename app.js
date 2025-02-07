const TRANSCRIPT_CONFIG = {
  animation: {
    stateTransitionDuration: 150,
    easing: 'easeOutQuad',
    linearEasing: 'linear',
  },
  colors: {
    primary: '#5B53FF',
    highlight: '#7E85FF',
    pastText: 'rgba(212, 214, 230, 0.75)',
    futureText: 'rgba(243, 243, 247, 0.90)',
    completedProgress: 'rgba(0, 0, 0, 0.3)',
  },
  transcript: {
    charactersPerMinute: 900,
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

    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progress.appendChild(progressFill);

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
      span.textContent = word.text + (index < this.words.length - 1 ? ' ' : '');
      span.className = 'future';
      span.dataset.start = word.start;
      span.style.cursor = 'pointer';
      text.appendChild(span);
    });

    content.appendChild(header);
    content.appendChild(text);

    segment.appendChild(progress);
    segment.appendChild(content);

    return segment;
  }

  update(currentTime, shouldAnimate = true, isPlaying = false) {
    let progress;
    if (currentTime < this.start) {
      progress = 0;
    } else if (currentTime >= this.end) {
      progress = 1;
    } else {
      const elapsedTime = currentTime - this.start;
      progress = elapsedTime / this.duration;
    }

    const progressBar = this.element.querySelector('.progress-fill');
    const duration = shouldAnimate
      ? TRANSCRIPT_CONFIG.animation.stateTransitionDuration
      : 0;

    if (currentTime >= this.end) {
      progressBar.classList.add('completed');
      anime({
        targets: progressBar,
        height: '100%',
        backgroundColor: TRANSCRIPT_CONFIG.colors.completedProgress,
        duration,
        easing: TRANSCRIPT_CONFIG.animation.easing,
      });
      this.updateWordStates('past', isPlaying);
    } else {
      progressBar.classList.remove('completed');
      anime({
        targets: progressBar,
        height: `${progress * 100}%`,
        backgroundColor: TRANSCRIPT_CONFIG.colors.primary,
        duration,
        easing: TRANSCRIPT_CONFIG.animation.easing,
      });
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

    // Force update all spans when seeking
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

      // Always update during seeking to ensure correct state
      span.dataset.state = newState;
      targets.push(span);
      colors.push(newColor);
    });

    if (targets.length > 0) {
      anime({
        targets,
        color: (el, i) => colors[i],
        duration: TRANSCRIPT_CONFIG.animation.stateTransitionDuration,
        easing: TRANSCRIPT_CONFIG.animation.easing,
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

    this.container = this.createContainer();
    this.playbackController = new PlaybackController(this);
    this.createControls();
    this.setupWordClickHandlers();
  }

  getTotalDuration() {
    return Math.max(...this.segments.map(s => s.end));
  }

  setupWordClickHandlers() {
    this.container.addEventListener('click', e => {
      if (e.target.tagName === 'SPAN' && e.target.dataset.start) {
        const time = parseFloat(e.target.dataset.start);
        this.playbackController.seek(time);
      }
    });
  }

  createControls() {
    const controls = document.createElement('div');
    controls.className = 'transcript-controls';

    const playPause = document.createElement('button');
    playPause.textContent = 'Play';
    playPause.onclick = () => {
      this.playbackController.togglePlayback();
      playPause.textContent = this.playbackController.isPlaying
        ? 'Pause'
        : 'Play';
    };

    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.onclick = () => this.playbackController.reset();

    controls.appendChild(playPause);
    controls.appendChild(reset);
    this.container.insertBefore(controls, this.container.firstChild);
    this.playPauseBtn = playPause;
  }

  createContainer() {
    const container = document.createElement('div');
    container.className = 'transcript-container';
    this.segments.forEach(segment => {
      container.appendChild(segment.element);
    });
    return container;
  }

  updateAllSegments(time, forceAnimate = false, isPlaying = false) {
    this.segments.forEach(segment => {
      // For seeking, we want instant transitions for segments between origin and destination
      const shouldAnimate =
        isPlaying || (time >= segment.start && time <= segment.end);

      if (time < segment.start) {
        this.updateSegmentProgress(
          segment,
          0,
          TRANSCRIPT_CONFIG.colors.primary,
          time,
          isPlaying,
          shouldAnimate
        );
      } else if (time >= segment.end) {
        this.updateSegmentProgress(
          segment,
          100,
          TRANSCRIPT_CONFIG.colors.completedProgress,
          time,
          isPlaying,
          shouldAnimate
        );
      } else {
        segment.update(time, shouldAnimate, isPlaying);
      }
    });
  }

  updateSegmentProgress(
    segment,
    height,
    color,
    time,
    isPlaying,
    shouldAnimate
  ) {
    const progressBar = segment.element.querySelector('.progress-fill');

    if (!shouldAnimate) {
      // Apply changes instantly without animation
      progressBar.style.height = `${height}%`;
      progressBar.style.backgroundColor = color;
      segment.update(time, false, isPlaying);
      return;
    }

    anime({
      targets: progressBar,
      height: `${height}%`,
      backgroundColor: color,
      duration: TRANSCRIPT_CONFIG.animation.stateTransitionDuration,
      easing: isPlaying
        ? TRANSCRIPT_CONFIG.animation.linearEasing
        : TRANSCRIPT_CONFIG.animation.easing,
    });
    segment.update(time, true, isPlaying);
  }

  resetAllSegments() {
    this.segments.forEach(segment => {
      const progressBar = segment.element.querySelector('.progress-fill');
      progressBar.classList.remove('completed');
      progressBar.style.height = '0%';
      progressBar.style.backgroundColor = TRANSCRIPT_CONFIG.colors.primary;

      anime.remove(progressBar);
      anime({
        targets: progressBar,
        height: '0%',
        backgroundColor: TRANSCRIPT_CONFIG.colors.primary,
        duration: 0,
        easing: 'linear',
      });

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
document.getElementById('app').innerHTML = '';
document.getElementById('app').appendChild(transcript.container);
