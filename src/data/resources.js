// ============================================================
// code-hive 站点配置与学习资源数据
// 维护方式：只需在本文件 resources 数组中增删条目即可，
// 页面上的卡片会自动跟着变化，无需改动任何组件代码。
// ============================================================

export const site = {
  name: 'code-hive',
  domain: 'codehive.asia',
  slogan: '酿一份少走弯路的成长路线图',
  intro:
    'code-hive 是一个面向大学生的技术社区。我们把亲测好用的学习网站、资料和工具整理成蜂巢，一格一格摆好，让你开箱即取，少走弯路。',
};

// 分类顺序即页面渲染顺序
export const categories = [
  { id: 'frontend', label: '前端开发' },
  { id: 'backend', label: '后端开发' },
  { id: 'ai', label: 'AI 与数据' },
  { id: 'tools', label: '通用工具' },
  { id: 'practice', label: '视频与实战' },
];

export const resources = [
  {
    name: 'MDN Web Docs',
    url: 'https://developer.mozilla.org/zh-CN/',
    desc: '前端开发的权威参考文档，HTML / CSS / JavaScript 一站查全，官方中文版。',
    category: 'frontend',
  },
  {
    name: 'freeCodeCamp',
    url: 'https://www.freecodecamp.org/chinese/',
    desc: '免费闯关式编程学习平台，从零基础到全栈，边学边练还能拿证书。',
    category: 'frontend',
  },
  {
    name: '阮一峰的网络日志',
    url: 'https://www.ruanyifeng.com/blog/',
    desc: '中文技术博客标杆，科技爱好者周刊持续更新，入门与进阶都值得读。',
    category: 'frontend',
  },
  {
    name: '菜鸟教程',
    url: 'https://www.runoob.com/',
    desc: '中文新手友好的编程速查站，各语言语法实例齐全，适合快速上手。',
    category: 'backend',
  },
  {
    name: '廖雪峰的教程',
    url: 'https://www.liaoxuefeng.com/',
    desc: 'Git、Python、Java 系列中文教程，讲解由浅入深，口碑多年。',
    category: 'backend',
  },
  {
    name: 'MySQL 官方文档',
    url: 'https://dev.mysql.com/doc/',
    desc: '数据库必修课绕不开 MySQL，官方文档是最准确的第一手资料。',
    category: 'backend',
  },
  {
    name: '动手学深度学习',
    url: 'https://zh.d2l.ai/',
    desc: '李沐团队的开源中文教材，理论配代码，AI 入门首选之一。',
    category: 'ai',
  },
  {
    name: 'Hugging Face Learn',
    url: 'https://huggingface.co/learn',
    desc: '免费官方课程，从机器学习基础到大模型应用，跟紧业界一线。',
    category: 'ai',
  },
  {
    name: 'Kaggle',
    url: 'https://www.kaggle.com/',
    desc: '数据科学与竞赛平台，真实数据集加实战项目，练手涨分两不误。',
    category: 'ai',
  },
  {
    name: 'GitHub',
    url: 'https://github.com/',
    desc: '全球最大的代码托管平台，读优秀开源项目本身就是最好的学习。',
    category: 'tools',
  },
  {
    name: 'Stack Overflow',
    url: 'https://stackoverflow.com/',
    desc: '程序员问答社区，报错信息搜一搜，大概率有人踩过同款坑。',
    category: 'tools',
  },
  {
    name: '力扣 LeetCode',
    url: 'https://leetcode.cn/',
    desc: '算法刷题平台，面试硬通货，按标签系统刷效率最高。',
    category: 'tools',
  },
  {
    name: '中国大学 MOOC',
    url: 'https://www.icourse163.org/',
    desc: '高校精品课免费看，计算机基础课跟着学校进度补最合适。',
    category: 'practice',
  },
  {
    name: '哔哩哔哩学习区',
    url: 'https://www.bilibili.com/',
    desc: '从尚硅谷到黑马程序员，大量免费成套编程课程，弹幕还能答疑。',
    category: 'practice',
  },
];
