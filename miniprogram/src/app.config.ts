export default defineAppConfig({
  pages: ['pages/index/index', 'pages/catch/index', 'pages/calc/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#faf6ee',
    navigationBarTitleText: '狗脑发热 · 藏宝阁比价',
    navigationBarTextStyle: 'black',
    backgroundColor: '#fbf6ec'
  },
  tabBar: {
    color: '#8a7a5c',
    selectedColor: '#c1452e',
    backgroundColor: '#faf6ee',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '比价' },
      { pagePath: 'pages/catch/index', text: '场景记录' },
      { pagePath: 'pages/calc/index', text: '计算器' }
    ]
  }
})
