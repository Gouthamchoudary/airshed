const videoId = '19jK_aqSPHHEeyFGBB6t_ZHEEe-5XRqK-';
if (videoId) {
  const watch = 'https://drive.google.com/file/d/' + videoId;
  const play = document.querySelector('#play');
  const drive = document.querySelector('#drive');
  drive.href = watch + '/view';
  play.hidden = drive.hidden = false;
  play.addEventListener('click', () => {
    const player = document.createElement('iframe');
    player.title = 'Airshed product walkthrough';
    player.src = watch + '/preview';
    player.allow = 'autoplay; fullscreen';
    player.allowFullscreen = true;
    document.querySelector('#screen').replaceChildren(player);
  });
}

