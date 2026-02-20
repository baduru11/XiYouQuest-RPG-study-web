// src/lib/quest/stage-questions.ts
import type { StageNumber, StageQuestions } from "./types";

export const STAGE_QUESTIONS: Record<StageNumber, StageQuestions> = {
  1: {
    recordingGroups: [
      {
        label: "Monosyllabic Characters",
        type: "monosyllabic",
        words: ["\u54F2", "\u6D3D", "\u6ED5", "\u6602", "\u7FFB", "\u60A6", "\u94ED", "\u6B27", "\u5DE2", "\u62AB"],
        category: "read_syllable",
      },
    ],
    mcqQuestions: [
      {
        prompt: "Which is the standard Putonghua word for 'sun'?",
        options: ["\u592A\u9633", "\u70ED\u5934", "\u65E5\u5934"],
        correctIndex: 0,
      },
      {
        prompt: "Which is the standard Putonghua word for 'rain'?",
        options: ["\u4E0B\u96E8", "\u843D\u96E8", "\u6389\u70B9\u513F"],
        correctIndex: 0,
      },
      {
        prompt: "Which is the standard Putonghua word for 'sweet potato'?",
        options: ["\u5730\u74DC", "\u7EA2\u85AF", "\u756A\u85AF"],
        correctIndex: 1,
      },
      {
        prompt: "\u4E00\uFF08   \uFF09\u94A5\u5319",
        options: ["\u628A", "\u6839", "\u6761", "\u4E2A", "\u4E32"],
        correctIndex: 0,
      },
      {
        prompt: "\u4E00\uFF08   \uFF09\u76AE\u5E26",
        options: ["\u6761", "\u6839", "\u6BB5", "\u4E2A", "\u526F"],
        correctIndex: 0,
      },
    ],
  },

  2: {
    recordingGroups: [
      {
        label: "Monosyllabic Group 1",
        type: "monosyllabic",
        words: ["\u8881", "\u6E3A", "\u8C2C", "\u5CE6", "\u8E31", "\u55D3", "\u9976", "\u77BB", "\u7A91", "\u8FC2"],
        category: "read_syllable",
      },
      {
        label: "Monosyllabic Group 2",
        type: "monosyllabic",
        words: ["\u9CD6", "\u6DAE", "\u888D", "\u9CC3", "\u8D63", "\u761F", "\u8568", "\u9A74", "\u5510", "\u733F"],
        category: "read_syllable",
      },
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["\u62D0\u5F2F\u513F", "\u63A2\u7D22", "\u521B\u4F5C", "\u897F\u6E38\u8BB0", "\u706B\u773C\u91D1\u775B", "\u53D6\u7ECF", "\u6316\u82E6", "\u8D2B\u7A77", "\u4E00\u76EE\u4E86\u7136"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["\u632B\u6298", "\u538B\u8FEB", "\u51CF\u8F7B", "\u7F6A\u6076", "\u91D1\u7B8D\u68D2", "\u7D27\u7B8D\u5492", "\u7B7E\u8BA2", "\u75B2\u5026", "\u4FA6\u67E5", "\u7A97\u5B50"],
        category: "read_word",
      },
    ],
    mcqQuestions: [
      {
        prompt: "Which sentence uses correct Putonghua word order?",
        options: ["\u6211\u5148\u8D70", "\u6211\u8D70\u5148", "\u6211\u8D70\u5934\u5148"],
        correctIndex: 0,
      },
      {
        prompt: "Which sentence uses correct Putonghua word order?",
        options: ["\u4F60\u5403\u996D\u5934\u5148", "\u4F60\u5403\u996D\u5148", "\u4F60\u5148\u5403\u996D"],
        correctIndex: 2,
      },
      {
        prompt: "Which question format is correct in Putonghua?",
        options: ["\u4F60\u542C\u5F97\u61C2\u4E0D\u61C2\uFF1F", "\u4F60\u542C\u4E0D\u542C\u5F97\u61C2\uFF1F", "\u4F60\u542C\u5F97\u61C2\u5417\uFF1F"],
        correctIndex: 1,
      },
      {
        prompt: "Which comparison sentence is correct?",
        options: ["\u6211\u6BD4\u4ED6\u4E09\u5C81\u5927", "\u6211\u5927\u4ED6\u4E09\u5C81", "\u6211\u6BD4\u4ED6\u5927\u4E09\u5C81"],
        correctIndex: 2,
      },
      {
        prompt: "Which question is grammatically correct?",
        options: ["\u4ED6\u6709\u6765\u6CA1\u6709\uFF1F", "\u4ED6\u6765\u6CA1\u6765\uFF1F", "\u4ED6\u6709\u6CA1\u6709\u6765\uFF1F"],
        correctIndex: 1,
      },
      {
        context: "\u4E8C\u5341\u516B\u661F**\u5BBF**\u662F\u53E4\u4EE3\u5929\u6587\u6982\u5FF5\u3002",
        prompt: "What is the correct pronunciation of \u5BBF here?",
        highlightedChar: "\u5BBF",
        options: ["s\u00F9", "xi\u01D4", "xi\u00F9"],
        correctIndex: 2,
      },
      {
        context: "\u8FD9\u672C\u4E66**\u8F7D**\u6709\u5F88\u591A\u5386\u53F2\u6545\u4E8B\u3002",
        prompt: "What is the correct pronunciation of \u8F7D here?",
        highlightedChar: "\u8F7D",
        options: ["z\u01CEi", "z\u00E0i"],
        correctIndex: 0,
      },
      {
        context: "\u8F66\u4E0A**\u8F7D**\u6EE1\u4E86\u8D27\u7269\u3002",
        prompt: "What is the correct pronunciation of \u8F7D here?",
        highlightedChar: "\u8F7D",
        options: ["z\u01CEi", "z\u00E0i"],
        correctIndex: 1,
      },
      {
        context: "\u8FD9\u628A\u6905\u5B50\u662F**\u9489**\u6B7B\u7684\uFF0C\u642C\u4E0D\u52A8\u3002",
        prompt: "What is the correct pronunciation of \u9489 here?",
        highlightedChar: "\u9489",
        options: ["d\u012Bng", "d\u00ECng"],
        correctIndex: 1,
      },
      {
        context: "\u4ED6\u5728\u5899\u4E0A**\u9489**\u4E86\u4E00\u9897\u9489\u5B50\u3002",
        prompt: "What is the correct pronunciation of \u9489 here?",
        highlightedChar: "\u9489",
        options: ["d\u012Bng", "d\u00ECng"],
        correctIndex: 1,
      },
    ],
  },

  3: {
    recordingGroups: [
      {
        label: "Monosyllabic Characters",
        type: "monosyllabic",
        words: ["\u85D5", "\u9576", "\u98D8", "\u7A9D", "\u582A", "\u7727", "\u78BE", "\u9AFB", "\u7A9F", "\u9B4F"],
        category: "read_syllable",
      },
      {
        label: "Multisyllabic Words",
        type: "multisyllabic",
        words: ["\u6602\u9996", "\u8870\u53D8", "\u8BCB\u6BC1", "\u6CD5\u672F", "\u9F50\u5929\u5927\u5723", "\u767D\u9AA8\u7CBE", "\u8138\u76D8\u513F", "\u6559\u8BAD", "\u7B4B\u6597\u4E91", "\u5929\u5BAB"],
        category: "read_word",
      },
      {
        label: "Passage Reading",
        type: "passage",
        words: [],
        passageText: "\u9EC4\u6C99\u7FFB\u6D8C\uFF0C\u94C1\u9508\u5473\u523A\u9F3B\u3002\u4F60\u521A\u63E1\u7D27\u6CD5\u6756\uFF0C\u524D\u65B9\u6C99\u5730\u9AA4\u7136\u5854\u9677\u2014\u2014\u767D\u9AA8\u592B\u4EBA\u51FA\u624B\u4E86\u3002\n\n\u4E94\u6839\u9AA8\u523A\u4ECE\u6C99\u4E0B\u65E0\u58F0\u523A\u51FA\u3002\u4F60\u95EA\u907F\u7740\u5FF5\u51FA\u7B2C\u4E00\u4E2A\u5B57\uFF0C\u58F0\u8C03\u5374\u56E0\u5598\u606F\u5FAE\u5FAE\u8D70\u6837\u3002\u5979\u5C16\u7B11\u4E00\u58F0\uFF0C\u9AA8\u523A\u5728\u534A\u7A7A\u8F6C\u5411\uFF0C\u64E6\u7740\u4F60\u7684\u808B\u9AA8\u5212\u8FC7\uFF0C\u8863\u895F\u6495\u5F00\uFF0C\u76AE\u8089\u706B\u8FA3\u8FA3\u5730\u75BC\u3002\u4F60\u8E09\u8DC4\u540E\u9000\uFF0C\u5979\u67AF\u767D\u7684\u624B\u6307\u51CC\u7A7A\u70B9\u51FA\uFF0C\u9AA8\u7BAD\u4ECE\u8EAB\u540E\u55D6\u55D6\u5C04\u6765\u2014\u2014\u4F60\u8EB2\u5F00\u4E09\u6839\uFF0C\u7B2C\u56DB\u6839\u9489\u4F4F\u4F60\u7684\u5DE6\u80A9\uFF0C\u6574\u4E2A\u4EBA\u88AB\u626F\u5F97\u5411\u540E\u4E00\u4EF0\u3002\n\n\u4E0D\u80FD\u614C\u3002\u4F60\u7AD9\u7A33\u811A\u8DDF\uFF0C\u518D\u6B21\u5F00\u53E3\u3002\u8FD9\u4E00\u6B21\u58F0\u97F3\u7A33\u4E86\uFF0C\u5B57\u5B57\u9971\u6EE1\uFF0C\u63B7\u5730\u6709\u58F0\u3002\u90A3\u4E2A\u8BCD\u5FF5\u5B8C\u7684\u77AC\u95F4\uFF0C\u6CD5\u6756\u9876\u7AEF\u70B8\u5F00\u4E00\u56E2\u91D1\u5149\u2014\u2014\u5149\u8292\u626B\u8FC7\uFF0C\u5979\u90A3\u5F20\u5A07\u5A9A\u7684\u4EBA\u8138\u5BF8\u5BF8\u788E\u88C2\uFF0C\u9732\u51FA\u767D\u9AA8\u9AB7\u9AC5\u7684\u672C\u6765\u9762\u76EE\u3002\u5979\u5C16\u53EB\u7740\uFF0C\u8EAB\u5F62\u51DD\u56FA\u7684\u5239\u90A3\uFF0C\u4F60\u51B2\u4E86\u4E0A\u53BB\u3002\n\n\u5979\u6325\u624B\u53EC\u6765\u4E09\u9762\u9AA8\u5899\u3002\u4F60\u5FF5\u4E00\u4E2A\u5B57\uFF0C\u7B2C\u4E00\u9762\u70B8\u88C2\uFF1B\u518D\u5FF5\u4E00\u5B57\uFF0C\u7B2C\u4E8C\u9762\u7C89\u788E\uFF1B\u7B2C\u4E09\u5B57\u51FA\u53E3\uFF0C\u6700\u540E\u4E00\u9762\u9AA8\u5899\u8FDE\u540C\u9AA8\u76FE\u540C\u65F6\u5D29\u6210\u9F51\u7C89\u3002\u6CD5\u6756\u62B5\u4F4F\u5979\u7684\u989D\u9AA8\uFF0C\u91D1\u5149\u707C\u5F97\u5979\u773C\u7736\u91CC\u7684\u9B3C\u706B\u5267\u70C8\u98A4\u6296\u3002\n\n\u5979\u8FD8\u60F3\u6323\u624E\uFF0C\u5E72\u67AF\u7684\u624B\u722A\u6293\u5411\u4F60\u7684\u5589\u54BD\u3002\u4F46\u4F60\u7684\u4E0B\u4E00\u4E2A\u8BCD\u5DF2\u7ECF\u51FA\u53E3\uFF0C\u7A33\u5F97\u50CF\u9489\u8FDB\u9AA8\u5934\u91CC\u3002\u90A3\u4E2A\u8BCD\u843D\u4E0B\u65F6\uFF0C\u5979\u7684\u8EAB\u4F53\u4ECE\u6307\u5C16\u5F00\u59CB\u6E83\u6563\uFF0C\u5316\u4F5C\u6D41\u6C99\u7C0C\u7C0C\u5760\u5730\uFF0C\u53EA\u7559\u4E0B\u4E00\u53E5\u8B66\u544A\u5728\u98CE\u4E2D\u6D88\u6563\u3002",
        category: "read_chapter",
      },
    ],
    mcqQuestions: [
      {
        context: "\u609F\u7A7A\u95EA\u907F\u7740\u5FF5\u51FA\u7B2C\u4E00\u4E2A\u5B57\uFF0C\u58F0\u8C03\u5374\u56E0\u5598\u606F\u5FAE\u5FAE**\u884C**\u6837\u3002",
        prompt: "What is the correct pronunciation of \u884C here?",
        highlightedChar: "\u884C",
        options: ["x\u00EDng", "h\u00E1ng"],
        correctIndex: 0,
      },
      {
        context: "\u5979\u5C16\u7B11\u4E00\u58F0\uFF0C\u9AA8\u523A\u5728\u534A\u7A7A**\u8F6C**\u5411\u3002",
        prompt: "What is the correct pronunciation of \u8F6C here?",
        highlightedChar: "\u8F6C",
        options: ["zhu\u01CEn", "zhu\u00E0n"],
        correctIndex: 0,
      },
      {
        context: "\u609F\u7A7A\u88AB\u9AA8\u7BAD\u9489\u4F4F\u80A9\u8180\uFF0C\u9669\u4E9B**\u843D**\u5728\u5730\u4E0A\u3002",
        prompt: "What is the correct pronunciation of \u843D here?",
        highlightedChar: "\u843D",
        options: ["lu\u00F2", "l\u00E0"],
        correctIndex: 0,
      },
      {
        context: "\u4E0D\u80FD\u614C\u3002\u609F\u7A7A\u7AD9\u7A33\u811A\u8DDF\uFF0C**\u91CD**\u65B0\u5F00\u53E3\u3002",
        prompt: "What is the correct pronunciation of \u91CD here?",
        highlightedChar: "\u91CD",
        options: ["zh\u00F2ng", "ch\u00F3ng"],
        correctIndex: 1,
      },
      {
        context: "\u6CD5\u6756\u9876\u7AEF\u70B8\u5F00\u4E00\u56E2\u91D1\u5149\uFF0C\u7167**\u5F97**\u6C99\u6F20\u5982\u540C\u767D\u663C\u3002",
        prompt: "What is the correct pronunciation of \u5F97 here?",
        highlightedChar: "\u5F97",
        options: ["d\u00E9", "de"],
        correctIndex: 1,
      },
      {
        context: "\u5979\u90A3\u5F20\u5A07\u5A9A\u7684\u4EBA\u8138\u5BF8\u5BF8\u788E\u88C2\uFF0C\u9732**\u51FA**\u767D\u9AA8\u9AB7\u9AC5\u7684\u672C\u6765\u9762\u76EE\u3002",
        prompt: "What is the correct pronunciation of \u51FA here?",
        highlightedChar: "\u51FA",
        options: ["ch\u016B", "ch\u00F9"],
        correctIndex: 0,
      },
      {
        context: "\u5979\u5C16\u53EB\u7740\uFF0C\u8EAB\u5F62\u51DD\u56FA\u7684**\u5239**\u90A3\u3002",
        prompt: "What is the correct pronunciation of \u5239 here?",
        highlightedChar: "\u5239",
        options: ["sh\u0101", "ch\u00E0"],
        correctIndex: 1,
      },
      {
        context: "\u609F\u7A7A\u5FF5\u51FA\u4E00\u4E2A\u5B57\uFF0C\u7B2C\u4E8C\u9762**\u4E3A**\u9F51\u7C89\u3002",
        prompt: "What is the correct pronunciation of \u4E3A here?",
        highlightedChar: "\u4E3A",
        options: ["w\u00E9i", "w\u00E8i"],
        correctIndex: 0,
      },
      {
        context: "\u6CD5\u6756\u62B5\u4F4F\u5979\u7684\u989D\u9AA8\uFF0C\u91D1\u5149\u707C**\u5F97**\u5979\u773C\u7736\u91CC\u7684\u9B3C\u706B\u5267\u70C8\u98A4\u6296\u3002",
        prompt: "What is the correct pronunciation of \u5F97 here?",
        highlightedChar: "\u5F97",
        options: ["de", "d\u00E9"],
        correctIndex: 0,
      },
      {
        context: "\u5979\u7684\u8EAB\u4F53\u4ECE\u6307\u5C16\u5F00\u59CB\u6E83\u6563\uFF0C\u53EA\u7559\u4E0B\u4E00\u53E5\u8B66\u544A\u5728\u98CE\u4E2D**\u6D88**\u6563\u3002",
        prompt: "What is the correct pronunciation of \u6D88 here?",
        highlightedChar: "\u6D88",
        options: ["xi\u0101o", "xu\u00E8"],
        correctIndex: 0,
      },
    ],
  },

  4: {
    recordingGroups: [
      {
        label: "Monosyllabic Characters",
        type: "monosyllabic",
        words: ["\u72FC", "\u6708", "\u5C71", "\u722A", "\u773C", "\u98CE", "\u5F71", "\u568E", "\u6797", "\u591C"],
        category: "read_syllable",
      },
      {
        label: "Multisyllabic Words",
        type: "multisyllabic",
        words: ["\u6708\u72FC\u9B54", "\u6708\u5149", "\u72FC\u568E", "\u5C71\u5F84", "\u5229\u722A", "\u9B3C\u706B", "\u6811\u5F71", "\u591C\u98CE", "\u5077\u88AD", "\u9000\u8DEF"],
        category: "read_word",
      },
    ],
    mcqQuestions: [
      {
        context: "\u609F\u7A7A\u4FA7\u8EAB\u95EA\u907F\u72FC\u9B54\u7684\u5229\u722A\uFF0C\u811A\u4E0B\u8E29\u5230\u4E00\u5757\u677E\u52A8\u7684\u77F3**\u5934**\u3002",
        prompt: "What is the correct pronunciation of \u5934 here?",
        highlightedChar: "\u5934",
        options: ["t\u00F3u", "tou"],
        correctIndex: 1,
      },
      {
        context: "\u72FC\u9B54\u7684\u773C\u775B\u5728\u6708\u5149\u4E0B\u95EA\u7740\u7EFF\u5149\uFF0C\u6B7B\u6B7B\u5730**\u76EF**\u7740\u609F\u7A7A\u3002",
        prompt: "What is the correct pronunciation of \u76EF here?",
        highlightedChar: "\u76EF",
        options: ["d\u012Bng", "d\u00ECng"],
        correctIndex: 0,
      },
      {
        context: "\u609F\u7A7A\u5FF5\u9519\u4E00\u4E2A\u5B57\uFF0C\u72FC\u9B54\u7684\u5229\u722A\u5212**\u8FC7**\u4ED6\u7684\u80A9\u5934\u3002",
        prompt: "What is the correct pronunciation of \u8FC7 here?",
        highlightedChar: "\u8FC7",
        options: ["gu\u00F2", "guo"],
        correctIndex: 1,
      },
      {
        context: "\u51E0\u756A\u56DE\u5408\u540E\uFF0C\u72FC\u9B54\u7EC8\u4E8E\u652F\u6491\u4E0D**\u4F4F**\u3002",
        prompt: "What is the correct pronunciation of \u4F4F here?",
        highlightedChar: "\u4F4F",
        options: ["zh\u00F9", "zhu"],
        correctIndex: 1,
      },
      {
        context: "\u609F\u7A7A\u6536\u8D77\u6CD5\u6756\uFF0C\u6708\u5149**\u7167**\u5728\u4ED6\u75B2\u60EB\u7684\u8138\u4E0A\u3002",
        prompt: "What is the correct pronunciation of \u7167 here?",
        highlightedChar: "\u7167",
        options: ["zh\u00E0o", "zh\u00E0o"],
        correctIndex: 0,
      },
      {
        prompt: "\u4ED6____\u72FC\u9B54\u85CF\u5728\u54EA\u3002Which is correct Putonghua?",
        options: ["\u4E0D\u6653\u5F97", "\u4E0D\u77E5\u9053", "\u4E0D\u6653\u7684"],
        correctIndex: 1,
      },
      {
        prompt: "\u8FD9\u573A\u6218\u6597____\u8981\u6253\u3002Which is correct Putonghua?",
        options: ["\u514D\u4E0D\u4E86", "\u514D\u4E0D\u5F97", "\u514D\u4E0D\u6389"],
        correctIndex: 0,
      },
      {
        prompt: "\u5B83\u7684\u773C\u775B____\u4E24\u56E2\u9B3C\u706B\u3002Which is correct Putonghua?",
        options: ["\u50CF", "\u597D\u50CF", "\u597D\u4F3C"],
        correctIndex: 1,
      },
      {
        prompt: "\u609F\u7A7A\u7684\u80A9\u8180____\u6293\u4F24\u4E86\u3002Which is correct Putonghua?",
        options: ["\u8BA9", "\u88AB", "\u7ED9"],
        correctIndex: 1,
      },
      {
        prompt: "\u609F\u7A7A____\u5F80\u524D\u8D70\u3002Which is correct Putonghua?",
        options: ["\u7EE7\u7EED", "\u8FDE\u7EED", "\u6301\u7EED"],
        correctIndex: 0,
      },
    ],
  },

  5: {
    recordingGroups: [
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["\u906E\u5929\u853D\u65E5", "\u5F25\u6F2B", "\u7FFB\u6D8C\u4E0D\u606F", "\u5E9E\u7136\u5927\u7269", "\u51DD\u795E\u6212\u5907", "\u8150\u5316", "\u54AE\u54EE", "\u8F70\u9E23", "\u7C0C\u7C0C\u843D\u4E0B", "\u8D64\u7EA2\u5982\u8840"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["\u707C\u70ED\u6C14\u6D41", "\u8FF8\u53D1\u91D1\u5149", "\u524A\u5F31", "\u5C16\u9510", "\u6311\u8D77", "\u7A33\u4F4F\u5FC3\u795E", "\u6E05\u6670\u9971\u6EE1", "\u6614\u65E5\u5F3A\u8005", "\u65E0\u8DEF\u53EF\u9000", "\u9707\u8033\u6B32\u804B"],
        category: "read_word",
      },
      {
        label: "Passage Reading",
        type: "passage",
        words: [],
        passageText: "\u96FE\u6C14\u50CF\u6D3B\u7684\u3002\u4F60\u8E0F\u5165\u7AF9\u6797\u7B2C\u4E00\u6B65\u5C31\u611F\u89C9\u5230\u4E86\u2014\u2014\u90A3\u4E9B\u7070\u767D\u7684\u96FE\u7F20\u7ED5\u7740\u4F60\u7684\u811A\u8E1D\uFF0C\u987A\u7740\u88E4\u7BA1\u5F80\u4E0A\u722C\u3002\u7AF9\u5B50\u5BC6\u5BC6\u9EBB\u9EBB\uFF0C\u906E\u5929\u853D\u65E5\uFF0C\u5341\u6B65\u4E4B\u5916\u53EA\u5269\u6A21\u7CCA\u7684\u5F71\u3002\u4F60\u63E1\u7D27\u6CD5\u6756\uFF0C\u653E\u6162\u811A\u6B65\uFF0C\u6307\u8282\u56E0\u4E3A\u7528\u529B\u800C\u6CDB\u767D\u3002\n\n\u5730\u9762\u7A81\u7136\u6296\u4E86\u4E00\u4E0B\u3002\n\n\u4F60\u987F\u4F4F\uFF0C\u4FA7\u8033\u503E\u542C\u3002\u53C8\u662F\u51E0\u4E0B\u98A4\u6296\uFF0C\u7AF9\u53F6\u7C0C\u7C0C\u843D\u4E0B\uFF0C\u6253\u7740\u65CB\u513F\u98D8\u8FDB\u96FE\u91CC\u3002\u98A4\u6296\u8D8A\u6765\u8D8A\u5267\u70C8\uFF0C\u53D8\u6210\u6709\u8282\u594F\u7684\u9707\u52A8\u2014\u2014\u549A\u3001\u549A\u3001\u549A\u2014\u2014\u50CF\u5DE8\u4EBA\u7684\u5FC3\u8DF3\uFF0C\u50CF\u6218\u9F13\uFF0C\u4ECE\u7AF9\u6797\u6DF1\u5904\u903C\u8FD1\u3002\u4F60\u538B\u4F4E\u8EAB\u5F62\uFF0C\u6CD5\u6756\u6A2A\u5728\u80F8\u524D\u3002\n\n\u96FE\u6C14\u731B\u5730\u88AB\u6495\u5F00\u3002\n\n\u4E00\u4E2A\u5DE8\u5927\u7684\u9ED1\u5F71\u51B2\u4E86\u51FA\u6765\uFF0C\u5934\u9876\u53CC\u89D2\u8D64\u7EA2\u5982\u8840\uFF0C\u56DB\u8E44\u8E0F\u5F97\u5730\u9762\u9686\u9686\u4F5C\u54CD\u3002\u725B\u9B54\u738B\uFF01\u4F60\u8FD8\u6CA1\u770B\u6E05\uFF0C\u90A3\u5E9E\u7136\u5927\u7269\u5DF2\u7ECF\u5230\u4E86\u8DDF\u524D\u3002\u4F60\u4FA7\u8EAB\u4E00\u6EDA\uFF0C\u725B\u89D2\u64E6\u7740\u4F60\u7684\u8170\u9645\u5212\u8FC7\uFF0C\u649E\u5728\u8EAB\u540E\u7684\u7AF9\u5B50\u4E0A\uFF0C\u7897\u53E3\u7C97\u7684\u7AF9\u5B50\u6B04\u8170\u6298\u65AD\u3002\n\n\u4F60\u7FFB\u8EAB\u8DC3\u8D77\uFF0C\u5F00\u53E3\u5FF5\u51FA\u7B2C\u4E00\u4E2A\u5B57\u3002\u58F0\u8C03\u521A\u51FA\u53E3\uFF0C\u4F60\u5C31\u77E5\u9053\u81EA\u5DF1\u9519\u4E86\u2014\u2014\u5598\u606F\u672A\u5B9A\uFF0C\u97F3\u8D70\u4E86\u6837\u3002\u725B\u9B54\u738B\u731B\u5730\u56DE\u5934\uFF0C\u4E00\u89D2\u6311\u5728\u4F60\u7684\u808B\u4E0B\u3002\u4F60\u6574\u4E2A\u4EBA\u88AB\u6380\u4E0A\u534A\u7A7A\uFF0C\u91CD\u91CD\u6454\u5728\u7AF9\u53F6\u5806\u91CC\uFF0C\u80F8\u53E3\u95F7\u5F97\u50CF\u538B\u4E86\u5757\u77F3\u5934\u3002\n\n\u4E0D\u80FD\u614C\u3002\u4F60\u6491\u7740\u6CD5\u6756\u7AD9\u8D77\u6765\uFF0C\u6DF1\u5438\u4E00\u53E3\u6C14\uFF0C\u518D\u6B21\u5F00\u53E3\u3002\u8FD9\u4E00\u6B21\u58F0\u97F3\u7A33\u4E86\uFF0C\u5B57\u5B57\u9971\u6EE1\uFF0C\u63B7\u5730\u6709\u58F0\u3002\u90A3\u4E2A\u8BCD\u5FF5\u5B8C\u7684\u77AC\u95F4\uFF0C\u6CD5\u6756\u9876\u7AEF\u70B8\u5F00\u4E00\u56E2\u91D1\u5149\u2014\u2014\u5149\u8292\u76F4\u76F4\u528C\u5411\u725B\u9B54\u738B\uFF0C\u4ED6\u5E9E\u5927\u7684\u8EAB\u8EAF\u4E00\u6643\uFF0C\u540E\u9000\u534A\u6B65\uFF0C\u53D1\u51FA\u4E00\u58F0\u75DB\u82E6\u7684\u54AE\u54EE\u3002\n\n\u4F60\u51B2\u4E86\u4E0A\u53BB\u3002\u4F60\u8E29\u7740\u81EA\u5DF1\u7684\u8282\u594F\uFF0C\u6BCF\u4E00\u6B65\u914D\u5408\u4E00\u6B21\u53D1\u97F3\u3002\u725B\u9B54\u738B\u4F4E\u5934\u51B2\u6765\uFF0C\u4F60\u5FF5\u51FA\u4E00\u4E2A\u5B57\uFF0C\u91D1\u5149\u5982\u9524\u7838\u5728\u4ED6\u7684\u8111\u95E8\u4E0A\uFF1B\u518D\u5FF5\u4E00\u5B57\uFF0C\u91D1\u5149\u528C\u5728\u4ED6\u7684\u80A9\u80DB\uFF1B\u7B2C\u4E09\u5B57\u51FA\u53E3\uFF0C\u91D1\u5149\u76F4\u76F4\u523A\u8FDB\u4ED6\u7684\u80F8\u53E3\u3002\u725B\u9B54\u738B\u7EC8\u4E8E\u652F\u6491\u4E0D\u4F4F\uFF0C\u5E9E\u5927\u7684\u8EAB\u8EAF\u8F70\u7136\u8DEC\u5730\uFF0C\u7136\u540E\u4FA7\u5012\u4E0B\u53BB\uFF0C\u9707\u5F97\u6EE1\u6797\u7AF9\u53F6\u7EB7\u98DE\u3002\n\n\u4F60\u6536\u8D77\u6CD5\u6756\uFF0C\u5598\u7740\u7C97\u6C14\u3002\u96FE\u6C14\u6E10\u6E10\u6563\u53BB\uFF0C\u7AF9\u6797\u6062\u590D\u4E86\u5BC2\u9759\u3002\u4F60\u62B9\u4E86\u628A\u989D\u5934\u7684\u6C57\uFF0C\u7EE7\u7EED\u5411\u524D\u8D70\u53BB\u3002",
        category: "read_chapter",
      },
    ],
    mcqQuestions: [
      {
        prompt: "\u96FE\u5927\u5F97____\u4E5F\u770B\u4E0D\u89C1\u3002Which is correct Putonghua?",
        options: ["\u5565", "\u4EC0\u4E48", "\u561B"],
        correctIndex: 1,
      },
      {
        prompt: "\u8FD9\u662F____\u58F0\u97F3\u3002Which is correct Putonghua?",
        options: ["\u5565\u5B50", "\u4EC0\u4E48", "\u5565"],
        correctIndex: 1,
      },
      {
        prompt: "____\u5F97\u5C0F\u5FC3\u70B9\u3002Which is correct Putonghua?",
        options: ["\u4FFA", "\u6211", "\u54B1"],
        correctIndex: 1,
      },
      {
        prompt: "\u8FD9\u725B\u9B54____\u5389\u5BB3\u3002Which is correct Putonghua?",
        options: ["\u771F", "\u5FD2", "\u597D"],
        correctIndex: 0,
      },
      {
        prompt: "\u8FD9\u56DE____\u5F97\u62FC\u547D\u3002Which is correct Putonghua?",
        options: ["\u516B\u6210", "\u80AF\u5B9A", "\u6307\u5B9A"],
        correctIndex: 1,
      },
      {
        prompt: "\u609F\u7A7A\u4E3E\u8D77\u6CD5\u6756\uFF0C\u51C6\u5907\u8FCE\u6218\u725B\u9B54\u738B\u3002Which sentence is grammatically correct?",
        options: ["\u609F\u7A7A\u5FF5\u5492\u8BED\u7ED9\u725B\u9B54\u738B", "\u609F\u7A7A\u5FF5\u7ED9\u725B\u9B54\u738B\u5492\u8BED", "\u609F\u7A7A\u5FF5\u5492\u8BED\u5BF9\u725B\u9B54\u738B"],
        correctIndex: 0,
      },
      {
        prompt: "\u725B\u9B54\u738B\u4ECE\u96FE\u6C14\u4E2D\u51B2\u51FA\u6765\u3002Which sentence is grammatically correct?",
        options: ["\u609F\u7A7A\u8EB2\u5F00\u4E86\u725B\u9B54\u738B\u7684\u89D2", "\u609F\u7A7A\u8EB2\u725B\u9B54\u738B\u7684\u89D2\u5F00\u4E86", "\u609F\u7A7A\u8EB2\u5F00\u89D2\u725B\u9B54\u738B\u7684"],
        correctIndex: 0,
      },
      {
        prompt: "\u609F\u7A7A\u5FF5\u9519\u4E86\u4E00\u4E2A\u5B57\u3002Which sentence is grammatically correct?",
        options: ["\u725B\u9B54\u738B\u628A\u89D2\u523A\u5411\u609F\u7A7A", "\u725B\u9B54\u738B\u628A\u89D2\u5BF9\u609F\u7A7A\u523A", "\u725B\u9B54\u738B\u628A\u609F\u7A7A\u523A\u89D2"],
        correctIndex: 0,
      },
      {
        prompt: "\u6CD5\u6756\u8FF8\u53D1\u51FA\u91D1\u5149\u3002Which sentence is grammatically correct?",
        options: ["\u91D1\u5149\u8BA9\u725B\u9B54\u738B\u524A\u5F31\u4E86\u529B\u91CF", "\u91D1\u5149\u524A\u5F31\u4E86\u725B\u9B54\u738B\u7684\u529B\u91CF", "\u91D1\u5149\u628A\u529B\u91CF\u524A\u5F31\u4E86\u725B\u9B54\u738B"],
        correctIndex: 1,
      },
      {
        prompt: "\u7ECF\u8FC7\u4E00\u756A\u82E6\u6218\u3002Which sentence is grammatically correct?",
        options: ["\u609F\u7A7A\u51FB\u8D25\u4E86\u725B\u9B54\u738B", "\u609F\u7A7A\u51FB\u8D25\u725B\u9B54\u738B\u4E86", "\u609F\u7A7A\u628A\u725B\u9B54\u738B\u51FB\u8D25\u4E86"],
        correctIndex: 0,
      },
    ],
  },

  6: {
    recordingGroups: [
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["\u8C41\u7136\u5F00\u6717", "\u6D9F\u6F2A", "\u5A49\u8F6C\u557C\u9E23", "\u66B4\u98CE\u96E8", "\u7F1D\u9699", "\u5B88\u62A4\u8005", "\u5929\u5EAD\u8BD5\u70BC", "\u7184\u7184\u751F\u8F89", "\u988A\u9996", "\u4E91\u6735\u513F"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["\u9707\u8033\u6B32\u804B", "\u7480\u74A8", "\u7EB9\u4E1D\u4E0D\u52A8", "\u51DD\u795E", "\u5C4F\u606F", "\u8131\u53E3\u800C\u51FA", "\u5B57\u6B63\u8154\u5706", "\u6C14\u5598\u5401\u5401", "\u6447\u6447\u6B32\u5760", "\u706B\u661F\u513F"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 3",
        type: "multisyllabic",
        words: ["\u5168\u529B\u4EE5\u8D74", "\u534A\u4FE1\u534A\u7591", "\u6045\u7136\u5927\u609F", "\u4ECE\u5BB9\u4E0D\u8FEB", "\u4E0D\u77E5\u6240\u63AA", "\u5FF5\u5FF5\u6709\u8BCD", "\u76EE\u7764\u53E3\u5446", "\u632F\u632F\u6709\u8BCD", "\u4E91\u5F69", "\u82B1\u74E3\u513F"],
        category: "read_word",
      },
    ],
    mcqQuestions: [
      {
        prompt: "\u8FD9\u5730\u65B9____\u5B89\u9759\u3002Which is correct Putonghua?",
        options: ["\u8D3C", "\u975E\u5E38", "\u8001"],
        correctIndex: 1,
      },
      {
        prompt: "\u8349\u88AB\u98CE\u5439\u5F97____\u3002Which is correct Putonghua?",
        options: ["\u76F4\u6643\u60A0", "\u76F4\u6447\u6643", "\u76F4\u6446\u52A8"],
        correctIndex: 1,
      },
      {
        prompt: "\u8FD9\u573A\u666F____\u9707\u64BC\u3002Which is correct Putonghua?",
        options: ["\u771F", "\u5FD2", "\u8D85"],
        correctIndex: 0,
      },
      {
        prompt: "\u8FD9\u58F0\u97F3____\u6709\u529B\u91CF\u3002Which is correct Putonghua?",
        options: ["\u633A", "\u602A", "\u86EE"],
        correctIndex: 0,
      },
      {
        prompt: "\u4ED6____\u4F60\u70B9\u4E86\u70B9\u5934\u3002Which is correct Putonghua?",
        options: ["\u671D", "\u51B2", "\u5BF9"],
        correctIndex: 2,
      },
      {
        prompt: "\u5B88\u62A4\u8005\u7684\u58F0\u97F3\u5728\u5C71\u8C37\u4E2D\u56DE\u8361\u3002Which is grammatically correct?",
        options: ["\u4F60\u542C\u89C1\u4E86\u5B88\u62A4\u8005\u7684\u58F0\u97F3", "\u4F60\u542C\u89C1\u5B88\u62A4\u8005\u7684\u58F0\u97F3\u4E86", "\u4F60\u628A\u5B88\u62A4\u8005\u7684\u58F0\u97F3\u542C\u89C1\u4E86"],
        correctIndex: 0,
      },
      {
        prompt: "\u4F60\u63E1\u7D27\u6CD5\u6756\uFF0C\u51C6\u5907\u63A5\u53D7\u8003\u9A8C\u3002Which is grammatically correct?",
        options: ["\u4F60\u628A\u6CD5\u6756\u63E1\u5728\u624B\u91CC", "\u4F60\u63E1\u6CD5\u6756\u5728\u624B\u91CC", "\u4F60\u5728\u624B\u91CC\u63E1\u6CD5\u6756"],
        correctIndex: 0,
      },
      {
        prompt: "\u4F60\u5FF5\u9519\u4E86\u4E00\u4E2A\u5B57\u3002Which is grammatically correct?",
        options: ["\u4E00\u9053\u95EA\u7535\u528C\u5728\u4F60\u80A9\u5934", "\u4E00\u9053\u95EA\u7535\u528C\u4F60\u80A9\u5934\u5728", "\u4E00\u9053\u95EA\u7535\u628A\u4F60\u80A9\u5934\u528C"],
        correctIndex: 0,
      },
      {
        prompt: "\u4F60\u5FF5\u5BF9\u4E86\u4E00\u4E2A\u590D\u6742\u7684\u8BCD\u3002Which is grammatically correct?",
        options: ["\u4F60\u8BA9\u5B88\u62A4\u8005\u70B9\u5934\u4E86", "\u5B88\u62A4\u8005\u5BF9\u4F60\u70B9\u4E86\u70B9\u5934", "\u5B88\u62A4\u8005\u51B2\u4F60\u70B9\u4E86\u5934"],
        correctIndex: 1,
      },
      {
        prompt: "\u95EA\u7535\u528C\u4E0B\u6765\u7684\u65F6\u5019\u3002Which is grammatically correct?",
        options: ["\u4F60\u88AB\u95EA\u7535\u528C\u4E2D\u4E86\u80A9\u8180", "\u4F60\u8BA9\u95EA\u7535\u528C\u4E2D\u4E86\u80A9\u8180", "\u4F60\u7ED9\u95EA\u7535\u528C\u4E2D\u4E86\u80A9\u8180"],
        correctIndex: 0,
      },
      {
        prompt: "\u5929\u7A7A\u4E2D\u98D8\u7740\u4E00_____\u4E91\u5F69\u3002",
        options: ["\u7247", "\u6735", "\u5757"],
        correctIndex: 1,
      },
      {
        prompt: "\u5B88\u62A4\u8005\u624B\u4E2D\u63E1\u7740\u4E00_____\u53D1\u5149\u7684\u6CD5\u6756\u3002",
        options: ["\u6839", "\u6761", "\u628A"],
        correctIndex: 0,
      },
      {
        prompt: "\u4F60\u7684\u80A9\u4E0A\u7559\u4E0B\u4E86\u4E00_____\u7126\u75D5\u3002",
        options: ["\u9053", "\u6761", "\u7247"],
        correctIndex: 0,
      },
      {
        prompt: "\u5634\u91CC\u5410\u51FA\u7684\u6BCF\u4E00_____\u5B57\u90FD\u50CF\u949F\u58F0\u3002",
        options: ["\u4E2A", "\u9897", "\u7C92"],
        correctIndex: 0,
      },
      {
        prompt: "\u4F60\u957F\u957F\u5730\u8212\u4E86\u4E00_____\u6C14\u3002",
        options: ["\u53E3", "\u80A1", "\u9635"],
        correctIndex: 0,
      },
    ],
  },

  7: {
    recordingGroups: [
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["\u7687\u5BAB", "\u94DC\u955C", "\u77D7\u7ACB", "\u626D\u66F2", "\u7A7A\u6D1E", "\u8150\u5316", "\u6B8B\u5F71", "\u4E3B\u5BB0", "\u56DA\u5F92", "\u79C3\u9E6B"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["\u9707\u8033\u6B32\u804B", "\u5414\u53EB", "\u541E\u98DF", "\u517B\u6599", "\u79C3\u9E6B", "\u7834\u788E", "\u97F3\u8282", "\u6270\u4E71", "\u5FC3\u795E", "\u6495\u54AC"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 3",
        type: "multisyllabic",
        words: ["\u6DF1\u547C\u5438", "\u56DE\u8361", "\u5636\u5414", "\u6E83\u6563", "\u524D\u6240\u672A\u6709", "\u900F\u4EAE", "\u6D88\u6563", "\u9752\u70DF", "\u6E05\u6F88", "\u6E29\u548C"],
        category: "read_word",
      },
      {
        label: "Final Passage",
        type: "passage",
        words: [],
        passageText: "\u4F60\u63A8\u5F00\u5BAB\u95E8\uFF0C\u611E\u5728\u539F\u5730\u3002\n\u6CA1\u6709\u5B9D\u5EA7\uFF0C\u6CA1\u6709\u5996\u9B54\u3002\u53EA\u6709\u4E00\u9762\u9762\u94DC\u955C\u77D7\u7ACB\u5176\u95F4\uFF0C\u6BCF\u4E00\u9762\u90FD\u6620\u51FA\u4F60\u7684\u8EAB\u5F71\u2014\u2014\u6709\u7684\u6A21\u7CCA\uFF0C\u6709\u7684\u626D\u66F2\uFF0C\u6709\u7684\u5634\u5507\u7FD5\u52A8\u5374\u53D1\u4E0D\u51FA\u58F0\u3002\u6B7B\u4E00\u822C\u7684\u5BC2\u9759\u538B\u5F97\u4F60\u5598\u4E0D\u8FC7\u6C14\u3002\n\"\u4F60\u6765\u4E86\u3002\"\n\u58F0\u97F3\u4ECE\u56DB\u9762\u516B\u65B9\u6D8C\u6765\u3002\u4F60\u63E1\u7D27\u6CD5\u6756\uFF0C\u5FAA\u58F0\u671B\u53BB\u3002\u5927\u6BBF\u5C3D\u5934\uFF0C\u4E00\u9762\u6700\u9AD8\u7684\u94DC\u955C\u524D\uFF0C\u7AD9\u7740\u4E00\u4E2A\u8EAB\u5F71\u2014\u2014\u90A3\u662F\u4F60\uFF0C\u53C8\u4E0D\u5B8C\u5168\u662F\u4F60\u3002\u5468\u8EAB\u7B3C\u7F69\u7070\u6697\u7684\u5149\uFF0C\u773C\u795E\u7A7A\u6D1E\uFF0C\u5634\u5507\u4E0D\u505C\u5F00\u5408\uFF0C\u5374\u6CA1\u6709\u58F0\u97F3\u3002\n\u94DC\u955C\u70B8\u88C2\u3002\u4ED6\u8D70\u4E86\u51FA\u6765\u3002\n\u5B59\u609F\u7A7A\u626D\u66F2\u7684\u5E7B\u5F71\u3002\u66FE\u7ECF\u7684\u8BED\u8A00\u4E3B\u5BB0\uFF0C\u5982\u4ECA\u7684\u8BED\u97F3\u56DA\u5F92\u3002\u4ED6\u9760\u541E\u98DF\u9519\u8BEF\u53D1\u97F3\u4E3A\u751F\u2014\u2014\u4F60\u4E00\u8DEF\u8D70\u6765\u5FF5\u9519\u7684\u6BCF\u4E00\u4E2A\u5B57\uFF0C\u90FD\u6210\u4E86\u6ECB\u517B\u4ED6\u7684\u517B\u6599\u3002\n\u6CA1\u6709\u9000\u8DEF\u3002\u4F60\u4E3E\u8D77\u6CD5\u6756\u3002\n\u4ED6\u7387\u5148\u51FA\u624B\u3002\u523A\u8033\u7684\u97F3\u6CE2\u6251\u9762\u800C\u6765\uFF0C\u4F60\u8033\u819C\u5267\u75DB\uFF0C\u811A\u6B65\u8E09\u8DC4\u3002\u4F60\u5F00\u53E3\u5FF5\u51FA\u7B2C\u4E00\u4E2A\u5B57\u2014\u2014\u58F0\u8C03\u521A\u51FA\u53E3\uFF0C\u4F60\u5C31\u77E5\u9053\u9519\u4E86\u3002\u5598\u606F\u672A\u5B9A\uFF0C\u97F3\u8D70\u4E86\u6837\u3002\u7834\u788E\u7684\u97F3\u8282\u547C\u5578\u7740\u6251\u4E0A\u6765\uFF0C\u6495\u54AC\u4F60\u7684\u80A9\u8180\u3002\u5267\u75DB\u8BA9\u4F60\u51E0\u4E4E\u5931\u58F0\u3002\n\u4E0D\u80FD\u614C\u3002\u4F60\u54AC\u7D27\u7259\uFF0C\u7AD9\u7A33\u811A\u8DDF\uFF0C\u518D\u6B21\u5F00\u53E3\u3002\u8FD9\u4E00\u6B21\u58F0\u97F3\u7A33\u4E86\uFF0C\u5B57\u5B57\u9971\u6EE1\uFF0C\u63B7\u5730\u6709\u58F0\u3002\u90A3\u4E2A\u8BCD\u5FF5\u5B8C\u7684\u77AC\u95F4\uFF0C\u6CD5\u6756\u9876\u7AEF\u70B8\u5F00\u4E00\u56E2\u91D1\u5149\u2014\u2014\u5149\u8292\u76F4\u76F4\u528C\u5411\u4ED6\u7684\u80F8\u53E3\u3002\u4ED6\u5636\u5414\u7740\u540E\u9000\u534A\u6B65\u3002\n\u4F60\u51B2\u4E86\u4E0A\u53BB\u3002\u4F60\u8E29\u7740\u81EA\u5DF1\u7684\u8282\u594F\uFF0C\u6BCF\u4E00\u6B65\u914D\u5408\u4E00\u6B21\u53D1\u97F3\u3002\u4ED6\u6325\u722A\u6293\u6765\uFF0C\u4F60\u5FF5\u51FA\u4E00\u4E2A\u5B57\uFF0C\u91D1\u5149\u7838\u5728\u4ED6\u7684\u989D\u5934\uFF1B\u4ED6\u5F20\u5634\u54AE\u54EE\uFF0C\u4F60\u518D\u5FF5\u4E00\u5B57\uFF0C\u91D1\u5149\u523A\u8FDB\u4ED6\u7684\u5589\u54BD\uFF1B\u4ED6\u5468\u8EAB\u9634\u5F71\u7FFB\u6D8C\uFF0C\u7B2C\u4E09\u5B57\u51FA\u53E3\uFF0C\u91D1\u5149\u6495\u5F00\u4ED6\u80F8\u53E3\u7684\u9ED1\u6697\u3002\u4ED6\u8E09\u8DC4\u7740\u540E\u9000\uFF0C\u8EAB\u5F71\u8D8A\u6765\u8D8A\u6DE1\u3002\n\u6700\u540E\u4E00\u4E2A\u5B57\u843D\u4E0B\u3002\u6CD5\u6756\u8FF8\u53D1\u51FA\u524D\u6240\u672A\u6709\u7684\u5149\u8292\uFF0C\u7167\u4EAE\u6574\u4E2A\u5927\u6BBF\u3002\u6240\u6709\u94DC\u955C\u91CC\u7684\u626D\u66F2\u8EAB\u5F71\u540C\u65F6\u6D88\u6563\uFF0C\u53EA\u5269\u4E0B\u4F60\u81EA\u5DF1\u7684\u5012\u5F71\uFF0C\u6E05\u6670\u800C\u575A\u5B9A\u3002\n\u4ED6\u5316\u4F5C\u4E00\u7F15\u9752\u70DF\uFF0C\u6D88\u5931\u5728\u7A7A\u6C14\u4E2D\u3002\n\u7A79\u9876\u7F13\u7F13\u6253\u5F00\uFF0C\u91D1\u8272\u7684\u9633\u5149\u503E\u6CC4\u800C\u4E0B\u3002\u4E00\u4E2A\u58F0\u97F3\u4ECE\u5929\u9645\u4F20\u6765\uFF0C\u6E05\u6F88\u5982\u6CC9\u6C34\uFF1A\n\"\u8C22\u8C22\u4F60\u3002\u8BED\u8A00\u7684\u529B\u91CF\uFF0C\u7EC8\u4E8E\u6062\u590D\u4E86\u3002\"\n\u4F60\u63E1\u7D27\u6CD5\u6756\uFF0C\u671B\u5411\u5929\u7A7A\u3002\u9633\u5149\u7167\u5728\u8138\u4E0A\uFF0C\u6E29\u6696\u800C\u660E\u4EAE\u3002",
        category: "read_chapter",
      },
    ],
    mcqQuestions: [
      {
        prompt: "\u8FD9\u5730\u65B9____\u8FD9\u4E48\u5B89\u9759\u3002Which is correct Putonghua?",
        options: ["\u548B", "\u600E\u4E48", "\u548B\u5730"],
        correctIndex: 1,
      },
      {
        prompt: "\u6709\u7684____\u4E0D\u6E05\u3002Which is correct Putonghua?",
        options: ["\u6A21\u7CCA", "\u8FF7\u7CCA", "\u6A21\u4E4E"],
        correctIndex: 0,
      },
      {
        prompt: "\u4ED6\u7684\u773C\u795E____\u3002Which is correct Putonghua?",
        options: ["\u5413\u4EBA", "\u7634\u4EBA", "\u9A87\u4EBA"],
        correctIndex: 0,
      },
      {
        prompt: "\u6211____\u4ED6\u80FD\u8D62\u3002Which is correct Putonghua?",
        options: ["\u4EE5\u4E3A", "\u610F\u601D", "\u89C9\u7740"],
        correctIndex: 0,
      },
      {
        prompt: "\u522B____\u4E86\uFF0C\u4E0A\u5427\u3002Which is correct Putonghua?",
        options: ["\u78E8\u53FD", "\u78E8\u6D0B\u5DE5", "\u78E8\u8E6D"],
        correctIndex: 2,
      },
      {
        prompt: "\u90A3\u8EAB\u5F71\u4ECE\u955C\u4E2D\u8D70\u4E86\u51FA\u6765\u3002Which is grammatically correct?",
        options: ["\u4ED6\u4ECE\u955C\u5B50\u91CC\u8D70\u51FA\u6765\u4E86", "\u4ED6\u8D70\u51FA\u6765\u4ECE\u955C\u5B50\u91CC\u4E86", "\u4ED6\u8D70\u51FA\u6765\u955C\u5B50\u4ECE\u91CC"],
        correctIndex: 0,
      },
      {
        prompt: "\u4ED6\u9760\u541E\u98DF\u9519\u8BEF\u7684\u53D1\u97F3\u4E3A\u751F\u3002Which is grammatically correct?",
        options: ["\u4ED6\u628A\u9519\u8BEF\u7684\u53D1\u97F3\u541E\u98DF", "\u9519\u8BEF\u7684\u53D1\u97F3\u88AB\u4ED6\u541E\u98DF", "\u4ED6\u541E\u98DF\u9519\u8BEF\u7684\u53D1\u97F3"],
        correctIndex: 2,
      },
      {
        prompt: "\u4F60\u5FF5\u9519\u4E86\u5B57\uFF0C\u4ED6\u7684\u529B\u91CF\u5C31\u4F1A\u589E\u5F3A\u3002Which is grammatically correct?",
        options: ["\u4F60\u88AB\u9519\u8BEF\u589E\u5F3A\u4E86\u529B\u91CF", "\u9519\u8BEF\u8BA9\u4F60\u589E\u5F3A\u4E86\u529B\u91CF", "\u9519\u8BEF\u88AB\u4ED6\u589E\u5F3A\u4E86\u529B\u91CF"],
        correctIndex: 1,
      },
      {
        prompt: "\u6CD5\u6756\u8FF8\u53D1\u7684\u91D1\u5149\u80FD\u6495\u88C2\u4ED6\u7684\u9634\u5F71\u3002Which is grammatically correct?",
        options: ["\u91D1\u5149\u628A\u9634\u5F71\u6495\u88C2\u4E86", "\u91D1\u5149\u88AB\u9634\u5F71\u6495\u88C2\u4E86", "\u9634\u5F71\u628A\u91D1\u5149\u6495\u88C2\u4E86"],
        correctIndex: 0,
      },
      {
        prompt: "\u6240\u6709\u7684\u78E8\u7EC3\uFF0C\u90FD\u662F\u4E3A\u4E86\u8FD9\u4E00\u523B\u3002Which is grammatically correct?",
        options: ["\u8FD9\u4E00\u523B\u88AB\u4F60\u7B49\u5F85", "\u4F60\u7B49\u5F85\u8FD9\u4E00\u523B", "\u8FD9\u4E00\u523B\u8BA9\u4F60\u7B49\u5F85"],
        correctIndex: 1,
      },
      {
        prompt: "\u4F60\u6DF1\u5438\u4E00\u53E3\u6C14\uFF0C\u5F00\u53E3\u5FF5\u51FA\u7B2C\u4E00\u4E2A\u5B57\u3002Which is grammatically correct?",
        options: ["\u4F60\u628A\u7B2C\u4E00\u4E2A\u5B57\u5FF5\u5F97\u6E05\u6E05\u695A\u695A", "\u4F60\u5FF5\u7B2C\u4E00\u4E2A\u5B57\u5F97\u6E05\u6E05\u695A\u695A", "\u4F60\u5FF5\u7B2C\u4E00\u4E2A\u5B57\u6E05\u6E05\u695A\u695A\u5F97"],
        correctIndex: 0,
      },
      {
        prompt: "\u4ED6\u7684\u8EAB\u5F71\u5316\u4F5C\u4E00\u7F15\u9752\u70DF\u3002Which is grammatically correct?",
        options: ["\u9752\u70DF\u88AB\u7A7A\u6C14\u4E2D\u6D88\u5931\u4E86", "\u9752\u70DF\u5728\u7A7A\u6C14\u4E2D\u6D88\u5931\u4E86", "\u9752\u70DF\u628A\u7A7A\u6C14\u4E2D\u6D88\u5931\u4E86"],
        correctIndex: 1,
      },
      {
        prompt: "\u6CD5\u6756\u9876\u7AEF\u70B8\u5F00\u4E00\u56E2\u91D1\u5149\u3002Which is grammatically correct?",
        options: ["\u6574\u4E2A\u5927\u6BBF\u88AB\u7167\u4EAE\u4E86", "\u6574\u4E2A\u5927\u6BBF\u628A\u7167\u4EAE\u4E86", "\u6574\u4E2A\u5927\u6BBF\u8BA9\u7167\u4EAE\u4E86"],
        correctIndex: 0,
      },
      {
        prompt: "\u91D1\u8272\u7684\u9633\u5149\u503E\u6CC4\u800C\u4E0B\u3002Which is grammatically correct?",
        options: ["\u9633\u5149\u7167\u5F97\u4F60\u7741\u4E0D\u5F00\u773C\u775B", "\u9633\u5149\u7167\u4F60\u7741\u4E0D\u5F00\u773C\u775B", "\u9633\u5149\u7167\u5F97\u4F60\u773C\u775B\u7741\u4E0D\u5F00"],
        correctIndex: 0,
      },
      {
        prompt: "\u5929\u7A7A\u4E2D\u4F20\u6765\u4E00\u4E2A\u6E05\u6F88\u7684\u58F0\u97F3\u3002Which is grammatically correct?",
        options: ["\u58F0\u97F3\u88AB\u4F60\u542C\u89C1\u4E86", "\u4F60\u542C\u89C1\u4E86\u58F0\u97F3", "\u4F60\u628A\u58F0\u97F3\u542C\u89C1\u4E86"],
        correctIndex: 1,
      },
    ],
  },
};
